begin;

create table if not exists public.demo_payment_simulations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete restrict,
  bill_id uuid not null references public.patient_bills(id) on delete restrict,
  idempotency_key uuid not null,
  reference_number text not null unique,
  payment_method text not null check (payment_method in ('gcash','paymaya','card')),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'simulated' check (status = 'simulated'),
  created_at timestamptz not null default now()
);

create index if not exists demo_payment_simulations_patient_bill_idx
  on public.demo_payment_simulations(patient_id,bill_id,created_at desc);
create unique index if not exists demo_payment_simulations_idempotency_key_idx
  on public.demo_payment_simulations(patient_id,idempotency_key);

alter table public.demo_payment_simulations enable row level security;
drop policy if exists "Patients read own demo payment simulations" on public.demo_payment_simulations;
create policy "Patients read own demo payment simulations"
  on public.demo_payment_simulations for select to authenticated
  using (patient_id = (select auth.uid()));

revoke all on public.demo_payment_simulations from public,anon,authenticated;
grant select on public.demo_payment_simulations to authenticated;

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
  v_prior_simulated numeric(14,2);
  v_prior_demo_payments numeric(14,2);
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
  if p_bill_id is null or p_idempotency_key is null or p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <= 0 then
    raise exception 'A valid demo amount and bill are required' using errcode='22023';
  end if;
  if p_method is null or p_method not in ('gcash','paymaya','card') then
    raise exception 'Unsupported demo payment method' using errcode='22023';
  end if;
  v_amount := round(p_amount,2);
  if v_amount <= 0 then raise exception 'Demo amount must be at least one cent' using errcode='22023'; end if;

  select * into v_bill
  from public.patient_bills b
  where b.id=p_bill_id and b.patient_id=v_patient_id
  for update;
  if not found or v_bill.is_demo is distinct from true then
    raise exception 'Owned demo bill not found' using errcode='P0002';
  end if;

  select * into v_existing from public.demo_payment_simulations s
  where s.patient_id=v_patient_id and s.idempotency_key=p_idempotency_key;
  if found then
    if v_existing.bill_id is distinct from v_bill.id or v_existing.amount is distinct from v_amount or v_existing.payment_method is distinct from p_method then
      raise exception 'Demo request key was already used for a different simulation' using errcode='23505';
    end if;
    select coalesce(sum(s.amount),0) into v_prior_simulated from public.demo_payment_simulations s
    where s.bill_id=v_bill.id and s.patient_id=v_patient_id and s.status='simulated';
    select coalesce(sum(p.amount),0) into v_prior_demo_payments from public.patient_payments p
    where p.bill_id=v_bill.id and p.patient_id=v_patient_id and p.is_demo is true and p.status in ('completed','paid','succeeded');
    return query select v_existing.id,v_existing.reference_number,v_existing.amount,v_existing.payment_method,v_existing.created_at,
      greatest(round(v_bill.total_amount-v_prior_simulated-v_prior_demo_payments,2),0);
    return;
  end if;

  select coalesce(sum(s.amount),0) into v_prior_simulated
  from public.demo_payment_simulations s
  where s.bill_id=v_bill.id and s.patient_id=v_patient_id and s.status='simulated';
  select coalesce(sum(p.amount),0) into v_prior_demo_payments
  from public.patient_payments p
  where p.bill_id=v_bill.id and p.patient_id=v_patient_id and p.is_demo is true
    and p.status in ('completed','paid','succeeded');

  v_remaining := greatest(round(v_bill.total_amount - v_prior_simulated - v_prior_demo_payments,2),0);
  if v_amount > v_remaining then
    raise exception 'Demo payment exceeds the remaining simulated balance' using errcode='22023';
  end if;

  v_reference := 'DEMO-PAY-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.demo_payment_simulations(patient_id,bill_id,idempotency_key,reference_number,payment_method,amount)
  values(v_patient_id,v_bill.id,p_idempotency_key,v_reference,p_method,v_amount)
  returning id,public.demo_payment_simulations.created_at into v_id,v_created_at;

  return query select v_id,v_reference,v_amount,p_method,v_created_at,greatest(v_remaining-v_amount,0);
end;
$$;

revoke all on function public.create_demo_payment_simulation(uuid,numeric,text,uuid) from public,anon;
grant execute on function public.create_demo_payment_simulation(uuid,numeric,text,uuid) to authenticated;

comment on table public.demo_payment_simulations is
  'Fictional patient payment simulations only. Never a real payment, receipt, or revenue record.';

create or replace function public.prevent_demo_bill_promotion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_demo is true and new.is_demo is distinct from true then
    raise exception 'A demo bill cannot be converted into a real payable bill' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_demo_bill_promotion() from public,anon,authenticated;
drop trigger if exists patient_bills_prevent_demo_promotion on public.patient_bills;
create trigger patient_bills_prevent_demo_promotion
  before update of is_demo on public.patient_bills
  for each row execute function public.prevent_demo_bill_promotion();

notify pgrst,'reload schema';
commit;
