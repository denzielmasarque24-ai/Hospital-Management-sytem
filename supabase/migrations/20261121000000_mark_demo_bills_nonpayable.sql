begin;

-- Bills did not previously have a reliable demo flag. New and existing rows
-- default to real bills; no existing billing data is reclassified here.
alter table public.patient_bills
  add column if not exists is_demo boolean not null default false;

create or replace function public.billing_record_patient_payment(p_bill_id uuid,p_amount numeric,p_payment_method text,p_external_reference uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_bill public.patient_bills%rowtype; v_paid numeric(14,2); v_id uuid; v_existing record;
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  if p_amount is null or p_amount<=0 or p_external_reference is null then raise exception 'Payment amount and idempotency reference are required' using errcode='22023'; end if;
  p_amount := round(p_amount,2);
  if p_amount<=0 then raise exception 'Payment amount must be at least one cent' using errcode='22023'; end if;
  select * into v_bill from public.patient_bills where id=p_bill_id for update;
  if not found then raise exception 'Bill not found' using errcode='P0002'; end if;
  -- The flag is authoritative; the reserved bill-number prefix preserves the
  -- existing demo convention for legacy rows until staff classify them.
  if v_bill.is_demo is true or coalesce(v_bill.bill_number,'') ~* '^DEMO[-_]' then
    raise exception 'Demo bills are not payable' using errcode='22023';
  end if;
  select id,bill_id,amount into v_existing from public.patient_payments where external_reference=p_external_reference;
  if v_existing.id is not null then
    if v_existing.bill_id<>p_bill_id or v_existing.amount<>p_amount then raise exception 'Payment reference was already used for a different payment' using errcode='23505'; end if;
    return v_existing.id;
  end if;
  select coalesce(sum(amount),0) into v_paid from public.patient_payments where bill_id=p_bill_id;
  if p_amount>v_bill.total_amount-v_paid then raise exception 'Payment exceeds the outstanding balance' using errcode='22023'; end if;
  insert into public.patient_payments(patient_id,bill_id,amount,payment_method,external_reference,receipt_number)
  values(v_bill.patient_id,p_bill_id,p_amount,coalesce(p_payment_method,''),p_external_reference,'R-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5))) returning id into v_id;
  select coalesce(sum(amount),0) into v_paid from public.patient_payments where bill_id=p_bill_id;
  update public.patient_bills set status=case when v_paid>=total_amount then 'paid' when v_paid>0 then 'partial' else 'unpaid' end where id=p_bill_id;
  return v_id;
end;
$$;

-- Enforce the same rule for any server-side or privileged insert path that
-- might bypass the billing RPC.
create or replace function public.reject_demo_bill_payment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_bill public.patient_bills%rowtype;
begin
  select * into v_bill from public.patient_bills where id=new.bill_id;
  if not found then raise exception 'Bill not found' using errcode='P0002'; end if;
  if v_bill.patient_id is distinct from new.patient_id then
    raise exception 'Patient does not own this bill' using errcode='23503';
  end if;
  if v_bill.is_demo is distinct from false or coalesce(v_bill.bill_number,'') ~* '^DEMO[-_]' then
    raise exception 'Demo or unverified bills are not payable' using errcode='22023';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_demo_bill_payment() from public,anon,authenticated;
drop trigger if exists patient_payments_reject_demo_bill on public.patient_payments;
create trigger patient_payments_reject_demo_bill
  before insert or update of bill_id,patient_id on public.patient_payments
  for each row execute function public.reject_demo_bill_payment();

-- Once a bill has a payment record, prevent it from being reclassified as a
-- demo bill and disappearing from actual payable/payment totals.
create or replace function public.prevent_bill_demo_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.is_demo is distinct from false
     and exists (select 1 from public.patient_payments p where p.bill_id=new.id) then
    raise exception 'Cannot mark a bill as demo while payment records exist' using errcode='22023';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_bill_demo_change() from public,anon,authenticated;
drop trigger if exists patient_bills_prevent_demo_change_with_payments on public.patient_bills;
create trigger patient_bills_prevent_demo_change_with_payments
  before update of is_demo on public.patient_bills
  for each row execute function public.prevent_bill_demo_change();

revoke all on function public.billing_record_patient_payment(uuid,numeric,text,uuid) from public,anon;
grant execute on function public.billing_record_patient_payment(uuid,numeric,text,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
