begin;

-- Keep the demo simulator on its own ledger and cap against the demo charges
-- recorded for the owned bill. This also excludes any legacy payment already
-- mirrored into the simulation ledger by matching its stable reference.
create or replace function public.create_demo_payment_simulation(
  p_bill_id uuid,
  p_amount numeric,
  p_method text,
  p_idempotency_key uuid
)
returns table(
  simulation_id uuid,
  reference_number text,
  amount numeric,
  payment_method text,
  created_at timestamptz,
  remaining_balance numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_id uuid := (select auth.uid());
  v_bill public.patient_bills%rowtype;
  v_total numeric(14,2);
  v_prior_simulated numeric(14,2);
  v_prior_legacy numeric(14,2);
  v_remaining numeric(14,2);
  v_amount numeric(12,2);
  v_reference text;
  v_id uuid;
  v_created_at timestamptz;
  v_existing public.demo_payment_simulations%rowtype;
begin
  if v_patient_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_bill_id is null or p_idempotency_key is null or p_amount is null
    or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 then
    raise exception 'A valid demo amount and bill are required' using errcode='22023';
  end if;
  if p_method is null or p_method not in ('gcash','paymaya','card') then
    raise exception 'Unsupported demo payment method' using errcode='22023';
  end if;
  v_amount := round(p_amount,2);
  if v_amount <= 0 then
    raise exception 'Demo amount must be at least one cent' using errcode='22023';
  end if;

  select * into v_bill
  from public.patient_bills b
  where b.id=p_bill_id and b.patient_id=v_patient_id
  for update;
  if not found or v_bill.is_demo is distinct from true then
    raise exception 'Owned demo bill not found' using errcode='P0002';
  end if;

  select round(coalesce(sum(c.quantity*c.unit_price),0),2) into v_total
  from public.patient_medical_charges c
  where c.bill_id=v_bill.id and c.patient_id=v_patient_id and c.is_demo is true;
  if v_total <= 0 then
    raise exception 'This demo bill has no recorded demo charges' using errcode='22023';
  end if;

  select * into v_existing from public.demo_payment_simulations s
  where s.patient_id=v_patient_id and s.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.bill_id is distinct from v_bill.id
      or v_existing.amount is distinct from v_amount
      or v_existing.payment_method is distinct from p_method then
      raise exception 'Demo request key was already used for a different simulation' using errcode='23505';
    end if;
  else
    select coalesce(sum(s.amount),0) into v_prior_simulated
    from public.demo_payment_simulations s
    where s.bill_id=v_bill.id and s.patient_id=v_patient_id and s.status='simulated';
    select coalesce(sum(p.amount),0) into v_prior_legacy
    from public.patient_payments p
    where p.bill_id=v_bill.id and p.patient_id=v_patient_id and p.is_demo is true
      and p.status in ('completed','paid','succeeded')
      and not exists (
        select 1 from public.demo_payment_simulations s
        where s.bill_id=v_bill.id and s.patient_id=v_patient_id
          and s.reference_number in (p.reference_number,p.receipt_number)
      );
    v_remaining := greatest(round(v_total-v_prior_simulated-v_prior_legacy,2),0);
    if v_amount > v_remaining then
      raise exception 'Demo payment exceeds the remaining simulated balance' using errcode='22023';
    end if;

    v_reference := 'DEMO-PAY-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
    insert into public.demo_payment_simulations as inserted
      (patient_id,bill_id,idempotency_key,reference_number,payment_method,amount)
    values (v_patient_id,v_bill.id,p_idempotency_key,v_reference,p_method,v_amount)
    returning inserted.id,inserted.created_at into v_id,v_created_at;
    v_existing.id := v_id;
    v_existing.reference_number := v_reference;
    v_existing.amount := v_amount;
    v_existing.payment_method := p_method;
    v_existing.created_at := v_created_at;
  end if;

  select coalesce(sum(s.amount),0) into v_prior_simulated
  from public.demo_payment_simulations s
  where s.bill_id=v_bill.id and s.patient_id=v_patient_id and s.status='simulated';
  select coalesce(sum(p.amount),0) into v_prior_legacy
  from public.patient_payments p
  where p.bill_id=v_bill.id and p.patient_id=v_patient_id and p.is_demo is true
    and p.status in ('completed','paid','succeeded')
    and not exists (
      select 1 from public.demo_payment_simulations s
      where s.bill_id=v_bill.id and s.patient_id=v_patient_id
        and s.reference_number in (p.reference_number,p.receipt_number)
    );
  return query select v_existing.id,v_existing.reference_number,v_existing.amount,
    v_existing.payment_method,v_existing.created_at,
    greatest(round(v_total-v_prior_simulated-v_prior_legacy,2),0);
end;
$$;

revoke all on function public.create_demo_payment_simulation(uuid,numeric,text,uuid) from public,anon;
grant execute on function public.create_demo_payment_simulation(uuid,numeric,text,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
