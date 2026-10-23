begin;

alter table public.patient_bills add column if not exists is_demo boolean not null default false;
alter table public.patient_medical_charges add column if not exists is_demo boolean not null default false;
alter table public.patient_payments add column if not exists is_demo boolean not null default false;
alter table public.patient_payments add column if not exists status text not null default 'completed';
alter table public.patient_payments add column if not exists payment_date timestamptz;
alter table public.patient_payments add column if not exists paid_at timestamptz;
alter table public.patient_payments add column if not exists reference_number text;
alter table public.patient_payments add column if not exists external_reference uuid;
alter table public.patient_payments add column if not exists receipt_number text;
alter table public.patient_payments add column if not exists refunded_amount numeric(12,2) not null default 0 check(refunded_amount>=0);
create unique index if not exists patient_payments_online_external_reference_idx on public.patient_payments(external_reference) where external_reference is not null;
create unique index if not exists patient_payments_online_receipt_number_idx on public.patient_payments(receipt_number) where receipt_number is not null;

create table if not exists public.online_payments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete restrict,
  bill_id uuid not null references public.patient_bills(id) on delete restrict,
  provider text not null default 'paymongo',
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'PHP' check (currency = 'PHP'),
  payment_method text not null check (payment_method in ('gcash','paymaya')),
  status text not null default 'creating' check (status in ('creating','pending','paid','failed','expired','refunded')),
  checkout_session_id text unique,
  checkout_url text,
  reference_number text,
  provider_payment_id text unique,
  idempotency_key text not null unique,
  patient_payment_id uuid references public.patient_payments(id) on delete restrict,
  failure_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (bill_id, patient_id) references public.patient_bills(id,patient_id)
);
alter table public.online_payments add column if not exists provider text;
alter table public.online_payments add column if not exists idempotency_key text;
alter table public.online_payments add column if not exists checkout_url text;
alter table public.online_payments add column if not exists patient_payment_id uuid references public.patient_payments(id) on delete restrict;
alter table public.online_payments add column if not exists failure_reason text;
alter table public.online_payments add column if not exists expires_at timestamptz;
alter table public.online_payments add column if not exists reference_number text;
alter table public.online_payments add column if not exists paid_at timestamptz;
alter table public.online_payments add column if not exists refunded_amount numeric(12,2) not null default 0 check(refunded_amount>=0);
alter table public.online_payments alter column currency set default 'PHP';
alter table public.online_payments alter column status set default 'creating';
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.online_payments'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%status%' loop
    execute format('alter table public.online_payments drop constraint %I',c.conname);
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='public.online_payments'::regclass and conname='online_payments_status_check') then
    alter table public.online_payments add constraint online_payments_status_check check(status in ('creating','pending','paid','completed','failed','expired','refunded'));
  end if;
end $$;
create unique index if not exists online_payments_idempotency_idx on public.online_payments(idempotency_key) where idempotency_key is not null;
create unique index if not exists online_payments_session_idx on public.online_payments(checkout_session_id) where checkout_session_id is not null;
create unique index if not exists online_payments_provider_payment_idx on public.online_payments(provider_payment_id) where provider_payment_id is not null;
create index if not exists online_payments_patient_idx on public.online_payments(patient_id,created_at desc);
create index if not exists online_payments_bill_idx on public.online_payments(bill_id,created_at desc);
alter table public.online_payments enable row level security;
revoke all on public.online_payments from anon, authenticated;
grant select on public.online_payments to authenticated;
drop policy if exists "Patients read own online payments" on public.online_payments;
create policy "Patients read own online payments" on public.online_payments for select to authenticated using (patient_id=(select auth.uid()));
drop policy if exists "Billing staff read online payments" on public.online_payments;
create policy "Billing staff read online payments" on public.online_payments for select to authenticated using (public.can_manage_patient_area('billing'));

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paymongo',
  provider_event_id text not null,
  event_type text not null,
  payment_id uuid,
  livemode boolean not null default false,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);
alter table public.payment_webhook_events add column if not exists provider text not null default 'paymongo';
alter table public.payment_webhook_events add column if not exists provider_event_id text;
alter table public.payment_webhook_events add column if not exists payment_id uuid;
alter table public.payment_webhook_events add column if not exists livemode boolean not null default false;
alter table public.payment_webhook_events add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.payment_webhook_events add column if not exists processing_error text;
create unique index if not exists payment_webhook_events_provider_event_idx on public.payment_webhook_events(provider,provider_event_id);

do $$ begin
  if exists (
    select 1 from public.online_payments o
    left join public.patient_bills b on b.id=o.bill_id
    where b.id is null or b.patient_id is distinct from o.patient_id or b.is_demo is distinct from false
  ) then
    raise exception 'Existing online payments include invalid, mismatched, or demo bill references. Review them before enabling checkout.';
  end if;
  if exists(select 1 from public.online_payments where status in ('creating','pending') and (idempotency_key is null or checkout_session_id is null or checkout_url is null)) then
    raise exception 'Existing unresolved online payment attempts lack checkout references. Reconcile them before enabling checkout.';
  end if;
end $$;

create or replace function public.prevent_bill_demo_with_online_payment()
returns trigger language plpgsql security definer set search_path=''
as $$ begin
  if new.is_demo is distinct from false and exists(select 1 from public.online_payments o where o.bill_id=new.id) then
    raise exception 'Cannot mark a bill as demo while online payment records exist';
  end if;
  return new;
end $$;
drop trigger if exists patient_bills_prevent_demo_change_with_online_payment on public.patient_bills;
create trigger patient_bills_prevent_demo_change_with_online_payment before update of is_demo on public.patient_bills for each row execute function public.prevent_bill_demo_with_online_payment();
alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_webhook_events from anon, authenticated;

create table if not exists public.online_payment_refunds (
  provider_refund_id text primary key,
  online_payment_id uuid not null references public.online_payments(id) on delete restrict,
  provider_event_id text not null unique,
  amount numeric(12,2) not null check(amount>0),
  currency text not null check(currency='PHP'),
  status text not null check(status='succeeded'),
  received_at timestamptz not null default now()
);
alter table public.online_payment_refunds enable row level security;
revoke all on public.online_payment_refunds from anon,authenticated;

create or replace function public.payment_prepare_checkout(p_bill_id uuid,p_method text)
returns table(payment_id uuid,amount_cents bigint,idempotency_key text,checkout_session_id text,checkout_url text,payment_status text)
language plpgsql security definer set search_path=''
as $$
declare v_bill public.patient_bills%rowtype; v_total numeric(12,2); v_paid numeric(12,2); v_due numeric(12,2); v_existing public.online_payments%rowtype; v_id uuid; v_key text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and upper(coalesce(p.role,''))='PATIENT') then raise exception 'A patient account is required' using errcode='42501'; end if;
  if p_method not in ('gcash','paymaya') then raise exception 'Unsupported payment method' using errcode='22023'; end if;
  select * into v_bill from public.patient_bills b where b.id=p_bill_id and b.patient_id=auth.uid() for update;
  if not found then raise exception 'Bill not found' using errcode='P0002'; end if;
  if v_bill.is_demo is distinct from false or coalesce(v_bill.bill_number,'') ~* '^DEMO[-_]' then raise exception 'Demo bill is not payable' using errcode='22023'; end if;
  if v_bill.status not in ('unpaid','partial') then raise exception 'Bill is not payable' using errcode='22023'; end if;
  if not exists(select 1 from public.patient_medical_charges c where c.bill_id=v_bill.id and c.patient_id=v_bill.patient_id and c.is_demo is false)
     or exists(select 1 from public.patient_medical_charges c where c.bill_id=v_bill.id and (c.patient_id<>v_bill.patient_id or c.is_demo is distinct from false or c.quantity<=0 or c.unit_price<0))
  then raise exception 'Bill contains unverified charges' using errcode='22023'; end if;
  select round(coalesce(sum(c.quantity*c.unit_price),0),2) into v_total from public.patient_medical_charges c where c.bill_id=v_bill.id and c.patient_id=v_bill.patient_id and c.is_demo is false;
  select coalesce(sum(case when p.status='refunded' and coalesce(p.refunded_amount,0)=0 then 0 when p.status in ('completed','refunded','paid','succeeded') then greatest(p.amount-coalesce(p.refunded_amount,0),0) else 0 end),0) into v_paid from public.patient_payments p where p.bill_id=v_bill.id and p.patient_id=v_bill.patient_id and p.is_demo is false;
  v_due:=round(v_total-v_paid,2);
  if v_due<=0 then raise exception 'No outstanding balance' using errcode='22023'; end if;
  select * into v_existing from public.online_payments o where o.bill_id=v_bill.id and o.patient_id=v_bill.patient_id and o.status in ('creating','pending') and (o.expires_at is null or o.expires_at>now()) order by o.created_at desc limit 1 for update;
  if found then
    if v_existing.payment_method<>p_method then raise exception 'An active checkout already exists using another method' using errcode='22023'; end if;
    if v_existing.idempotency_key is null or (v_existing.status='pending' and v_existing.checkout_url is null) then raise exception 'An existing checkout requires billing reconciliation' using errcode='22023'; end if;
    if v_existing.amount<>v_due then raise exception 'The bill changed while checkout is active. Contact billing before continuing.' using errcode='22023'; end if;
    return query select v_existing.id,(v_existing.amount*100)::bigint,v_existing.idempotency_key,v_existing.checkout_session_id,v_existing.checkout_url,v_existing.status; return;
  end if;
  if exists(select 1 from public.online_payments o where o.bill_id=v_bill.id and o.status='creating') then raise exception 'A checkout is being prepared. Please retry shortly' using errcode='55P03'; end if;
  v_id:=gen_random_uuid(); v_key:='medwell-checkout-'||v_id::text;
  insert into public.online_payments(id,patient_id,bill_id,provider,amount,payment_method,idempotency_key,expires_at) values(v_id,v_bill.patient_id,v_bill.id,'paymongo',v_due,p_method,v_key,now()+interval '30 minutes');
  return query select v_id,(v_due*100)::bigint,v_key,null::text,null::text,'creating'::text;
end $$;

create or replace function public.payment_save_checkout(p_payment_id uuid,p_session_id text,p_checkout_url text,p_expires_at timestamptz)
returns void language plpgsql security definer set search_path=''
as $$
begin
  update public.online_payments set checkout_session_id=p_session_id,checkout_url=p_checkout_url,status='pending',expires_at=least(coalesce(p_expires_at,now()+interval '30 minutes'),now()+interval '2 hours'),updated_at=now() where id=p_payment_id and status='creating';
  if not found and not exists(select 1 from public.online_payments where id=p_payment_id and status='pending' and checkout_session_id=p_session_id and checkout_url=p_checkout_url) then raise exception 'Checkout attempt is no longer active'; end if;
end $$;

create or replace function public.payment_fail_checkout(p_payment_id uuid,p_reason text)
returns void language sql security definer set search_path=''
as $$ update public.online_payments set status='failed',failure_reason=left(p_reason,500),updated_at=now() where id=p_payment_id and status='creating' $$;

create or replace function public.payment_process_webhook(p_event_id text,p_event_type text,p_payload jsonb,p_session_id text,p_provider_payment_id text,p_amount_cents bigint,p_currency text,p_method text,p_livemode boolean)
returns text language plpgsql security definer set search_path=''
as $$
declare v_online public.online_payments%rowtype; v_bill public.patient_bills%rowtype; v_payment uuid; v_receipt text; v_paid numeric(12,2); v_total numeric(12,2);
begin
  if p_livemode is distinct from false then raise exception 'Live mode webhooks are disabled'; end if;
  if p_event_id is null or p_event_type not in ('checkout_session.payment.paid','refund.succeeded') then raise exception 'Unsupported webhook event'; end if;
  insert into public.payment_webhook_events(provider,provider_event_id,event_type,payment_id,payload,livemode) values('paymongo',p_event_id,p_event_type,nullif(p_payload#>>'{data,attributes,data,attributes,metadata,online_payment_id}','')::uuid,p_payload,false) on conflict(provider,provider_event_id) do nothing;
  if not found then return 'duplicate'; end if;
  if p_event_type='refund.succeeded' then
    select * into v_online from public.online_payments o where o.provider_payment_id=p_provider_payment_id for update;
    if not found or p_amount_cents is null or p_amount_cents<=0 or p_currency<>'PHP' then raise exception 'Unknown payment or invalid refund details'; end if;
    if v_online.refunded_amount+(p_amount_cents::numeric/100)>v_online.amount then raise exception 'Refund exceeds the remaining payment amount'; end if;
    insert into public.online_payment_refunds(provider_refund_id,online_payment_id,provider_event_id,amount,currency,status)
      values(p_payload#>>'{data,attributes,data,id}',v_online.id,p_event_id,p_amount_cents::numeric/100,'PHP','succeeded') on conflict(provider_refund_id) do nothing;
    if not found then update public.payment_webhook_events set processed_at=now(),payment_id=v_online.id where provider='paymongo' and provider_event_id=p_event_id; return 'duplicate'; end if;
    update public.online_payments set refunded_amount=refunded_amount+(p_amount_cents::numeric/100),status=case when refunded_amount+(p_amount_cents::numeric/100)>=amount then 'refunded' else 'paid' end,updated_at=now() where id=v_online.id;
    update public.patient_payments set refunded_amount=refunded_amount+(p_amount_cents::numeric/100),status=case when refunded_amount+(p_amount_cents::numeric/100)>=amount then 'refunded' else 'completed' end where id=v_online.patient_payment_id;
    select round(coalesce(sum(c.quantity*c.unit_price),0),2) into v_total from public.patient_medical_charges c where c.bill_id=v_online.bill_id and c.patient_id=v_online.patient_id and c.is_demo is false;
    select coalesce(sum(case when p.status='refunded' and coalesce(p.refunded_amount,0)=0 then 0 when p.status in ('completed','refunded','paid','succeeded') then greatest(p.amount-coalesce(p.refunded_amount,0),0) else 0 end),0) into v_paid from public.patient_payments p where p.bill_id=v_online.bill_id and p.is_demo is false;
    update public.patient_bills set status=case when v_paid>=v_total then 'paid' when v_paid>0 then 'partial' else 'unpaid' end where id=v_online.bill_id and status in ('unpaid','partial','paid');
    update public.payment_webhook_events set processed_at=now(),payment_id=v_online.id where provider='paymongo' and provider_event_id=p_event_id;
    return 'refunded';
  end if;
  select * into v_online from public.online_payments o where o.checkout_session_id=p_session_id for update;
  if not found or v_online.status not in ('pending','paid') then raise exception 'Unknown or inactive checkout session'; end if;
  if v_online.status='paid' then update public.payment_webhook_events set processed_at=now() where provider='paymongo' and provider_event_id=p_event_id; return 'duplicate'; end if;
  if v_online.amount*100<>p_amount_cents or p_currency<>'PHP' or v_online.payment_method<>p_method then raise exception 'Provider payment details do not match checkout'; end if;
  select * into v_bill from public.patient_bills b where b.id=v_online.bill_id and b.patient_id=v_online.patient_id for update;
  if not found or v_bill.is_demo is distinct from false or v_bill.status not in ('unpaid','partial') then raise exception 'Bill is missing or not payable'; end if;
  if exists(select 1 from public.patient_medical_charges c where c.bill_id=v_bill.id and (c.patient_id<>v_bill.patient_id or c.is_demo is distinct from false)) then raise exception 'Bill now contains demo or mismatched charges'; end if;
  select round(coalesce(sum(c.quantity*c.unit_price),0),2) into v_total from public.patient_medical_charges c where c.bill_id=v_bill.id and c.patient_id=v_bill.patient_id and c.is_demo is false;
  select coalesce(sum(case when p.status in ('completed','refunded') then p.amount-coalesce(p.refunded_amount,0) else 0 end),0) into v_paid from public.patient_payments p where p.bill_id=v_bill.id and p.patient_id=v_bill.patient_id and p.is_demo is false;
  if v_online.amount>round(v_total-v_paid,2) then raise exception 'Outstanding balance changed after checkout was created'; end if;
  v_receipt:='MW-'||to_char(now() at time zone 'Asia/Manila','YYYYMMDD')||'-'||upper(substr(replace(v_online.id::text,'-',''),1,10));
  insert into public.patient_payments(patient_id,bill_id,amount,payment_method,external_reference,receipt_number,reference_number,status,payment_date,paid_at,is_demo)
  values(v_online.patient_id,v_online.bill_id,v_online.amount,case p_method when 'paymaya' then 'Maya' else 'GCash' end,v_online.id,v_receipt,p_provider_payment_id,'completed',now(),now(),false) returning id into v_payment;
  update public.online_payments set status='paid',provider_payment_id=p_provider_payment_id,patient_payment_id=v_payment,reference_number=p_provider_payment_id,paid_at=now(),updated_at=now() where id=v_online.id;
  select round(coalesce(sum(c.quantity*c.unit_price),0),2) into v_total from public.patient_medical_charges c where c.bill_id=v_bill.id and c.patient_id=v_bill.patient_id and c.is_demo is false;
  select coalesce(sum(case when p.status='refunded' and coalesce(p.refunded_amount,0)=0 then 0 when p.status in ('completed','refunded','paid','succeeded') then greatest(p.amount-coalesce(p.refunded_amount,0),0) else 0 end),0) into v_paid from public.patient_payments p where p.bill_id=v_bill.id and p.is_demo is false;
  update public.patient_bills set status=case when v_paid>=v_total then 'paid' when v_paid>0 then 'partial' else 'unpaid' end where id=v_bill.id and status in ('unpaid','partial');
  update public.payment_webhook_events set processed_at=now() where provider='paymongo' and provider_event_id=p_event_id;
  return 'paid';
end $$;

create or replace function public.payment_admin_summary()
returns table(id uuid,patient_id uuid,bill_id uuid,bill_number text,amount numeric,refunded_amount numeric,currency text,payment_method text,status text,checkout_session_id text,provider_payment_id text,paid_at timestamptz,created_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=''
as $$ begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  return query select o.id,o.patient_id,o.bill_id,b.bill_number,o.amount,o.refunded_amount,o.currency,o.payment_method,o.status,o.checkout_session_id,o.provider_payment_id,o.paid_at,o.created_at,o.updated_at from public.online_payments o join public.patient_bills b on b.id=o.bill_id order by o.created_at desc limit 500;
end $$;

revoke all on function public.payment_prepare_checkout(uuid,text) from public,anon;
revoke all on function public.payment_save_checkout(uuid,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.payment_fail_checkout(uuid,text) from public,anon,authenticated;
revoke all on function public.payment_process_webhook(text,text,jsonb,text,text,bigint,text,text,boolean) from public,anon,authenticated;
revoke all on function public.payment_admin_summary() from public,anon;
grant execute on function public.payment_prepare_checkout(uuid,text) to authenticated;
grant execute on function public.payment_admin_summary() to authenticated;
grant execute on function public.payment_save_checkout(uuid,text,text,timestamptz) to service_role;
grant execute on function public.payment_fail_checkout(uuid,text) to service_role;
grant execute on function public.payment_process_webhook(text,text,jsonb,text,text,bigint,text,text,boolean) to service_role;

commit;
