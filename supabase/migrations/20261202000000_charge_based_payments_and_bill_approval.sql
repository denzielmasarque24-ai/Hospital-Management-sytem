begin;

-- New invoices are drafts until a billing-authorized user explicitly approves them.
-- Existing bills (including DEMO-RENALYN-202610) are not rewritten by this migration.
alter table public.patient_bills
  add column if not exists payment_approved_at timestamptz,
  add column if not exists payment_approved_by uuid references auth.users(id) on delete set null;

alter table public.online_payments
  add column if not exists provider_payment_intent_id text;

do $reconcile$
begin
  if exists(
    select 1 from public.online_payments o
    where o.status in ('creating','pending','failed') and o.checkout_session_id is not null
  ) then
    raise exception 'Unresolved real PayMongo checkouts exist. Reconcile or close them with PayMongo before applying the bill-approval migration.';
  end if;
end;
$reconcile$;

do $migration$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='public.online_payments'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%payment_method%'
  loop execute format('alter table public.online_payments drop constraint %I',c.conname); end loop;
  alter table public.online_payments add constraint online_payments_payment_method_check
    check(payment_method in ('gcash','paymaya','card'));

  for c in
    select conname from pg_constraint
    where conrelid='public.online_payments'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop execute format('alter table public.online_payments drop constraint %I',c.conname); end loop;
  alter table public.online_payments add constraint online_payments_status_check
    check(status in ('creating','pending','paid','completed','failed','expired','cancelled','refunded'));
end;
$migration$;

create unique index if not exists online_payments_provider_intent_idx
  on public.online_payments(provider_payment_intent_id)
  where provider_payment_intent_id is not null;

-- Create invoice rows only in the existing authoritative charge table.
create or replace function public.billing_create_patient_bill(
  p_patient_id uuid,p_admission_id uuid,p_description text,p_discount numeric,
  p_taxes numeric,p_items jsonb,p_external_reference uuid
)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_bill uuid; v_number text; v_subtotal numeric(14,2); v_existing_patient uuid; v_item jsonb;
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  if p_external_reference is null then raise exception 'A bill idempotency reference is required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_external_reference::text,0));
  select id,patient_id into v_bill,v_existing_patient from public.patient_bills where external_reference=p_external_reference;
  if v_bill is not null then
    if v_existing_patient is distinct from p_patient_id then raise exception 'Bill reference was already used for another patient' using errcode='23505'; end if;
    return v_bill;
  end if;
  if coalesce(jsonb_typeof(p_items),'')<>'array' then raise exception 'At least one charge is required' using errcode='22023'; end if;
  if jsonb_array_length(p_items)=0 then raise exception 'At least one charge is required' using errcode='22023'; end if;
  if coalesce(p_discount,0)<0 or coalesce(p_taxes,0)<0 or lower(coalesce(p_discount,0)::text) in ('nan','infinity','-infinity') or lower(coalesce(p_taxes,0)::text) in ('nan','infinity','-infinity') then raise exception 'Discounts and fees must be finite nonnegative amounts' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) as entries(value) where btrim(coalesce(value->>'description',''))='' or coalesce((value->>'quantity')::numeric,0)<=0 or coalesce((value->>'unit_price')::numeric,-1)<0 or lower(btrim(coalesce(value->>'quantity',''))) in ('nan','infinity','-infinity') or lower(btrim(coalesce(value->>'unit_price',''))) in ('nan','infinity','-infinity') or coalesce(nullif(value->>'category',''),'other') not in ('room','consultation','laboratory','diagnostic','medicine','medical_supply','other')) then
    raise exception 'Every charge needs a description, positive quantity, and nonnegative unit price' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  if p_admission_id is not null and not exists(select 1 from public.patient_admissions a where a.id=p_admission_id and a.patient_id=p_patient_id) then raise exception 'Admission does not belong to this patient' using errcode='23503'; end if;
  v_number:='B-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
  insert into public.patient_bills(patient_id,admission_id,bill_number,description,total_amount,approved_discount,taxes_and_fees,external_reference,is_demo)
    values(p_patient_id,p_admission_id,v_number,coalesce(p_description,''),0,coalesce(p_discount,0),coalesce(p_taxes,0),p_external_reference,false)
    returning id into v_bill;
  for v_item in select value from jsonb_array_elements(p_items) as entries(value) loop
    insert into public.patient_medical_charges(patient_id,admission_id,bill_id,item_name,category,quantity,unit_price,recorded_by,is_demo)
    values(p_patient_id,p_admission_id,v_bill,btrim(v_item->>'description'),coalesce(nullif(v_item->>'category',''),'other'),(v_item->>'quantity')::numeric,(v_item->>'unit_price')::numeric,auth.uid(),false);
  end loop;
  select round(coalesce(sum(quantity*unit_price),0),2) into v_subtotal from public.patient_medical_charges where bill_id=v_bill and patient_id=p_patient_id and is_demo is false;
  if coalesce(p_discount,0)>v_subtotal then raise exception 'Discount cannot exceed the subtotal' using errcode='22023'; end if;
  update public.patient_bills set total_amount=round(v_subtotal-coalesce(p_discount,0)+coalesce(p_taxes,0),2) where id=v_bill;
  return v_bill;
end;
$function$;

create or replace function public.billing_approve_patient_bill(p_bill_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_bill public.patient_bills%rowtype; v_subtotal numeric(14,2);
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  select * into v_bill from public.patient_bills where id=p_bill_id for update;
  if not found then raise exception 'Bill not found' using errcode='P0002'; end if;
  if v_bill.is_demo is distinct from false or coalesce(v_bill.bill_number,'') ~* '^DEMO[-_]' then raise exception 'A demo bill cannot be approved for payment' using errcode='22023'; end if;
  if v_bill.status='paid' then raise exception 'A paid bill cannot be re-approved' using errcode='22023'; end if;
  if exists(select 1 from public.online_payments where bill_id=p_bill_id and status in ('creating','pending')) then raise exception 'Reconcile or close active checkout attempts before approving this bill' using errcode='55000'; end if;
  if not exists(select 1 from public.patient_medical_charges where bill_id=p_bill_id and patient_id=v_bill.patient_id and is_demo is false)
    or exists(select 1 from public.patient_medical_charges where bill_id=p_bill_id and (patient_id<>v_bill.patient_id or is_demo is distinct from false or lower(quantity::text) in ('nan','infinity','-infinity') or lower(unit_price::text) in ('nan','infinity','-infinity'))) then
    raise exception 'Bill must contain only verified, non-demo medical charges' using errcode='22023';
  end if;
  select round(coalesce(sum(quantity*unit_price),0),2) into v_subtotal from public.patient_medical_charges where bill_id=p_bill_id and patient_id=v_bill.patient_id and is_demo is false;
  if lower(v_bill.approved_discount::text) in ('nan','infinity','-infinity') or lower(v_bill.taxes_and_fees::text) in ('nan','infinity','-infinity') or lower(v_bill.total_amount::text) in ('nan','infinity','-infinity') or v_bill.approved_discount>v_subtotal or round(v_subtotal-v_bill.approved_discount+v_bill.taxes_and_fees,2)<>v_bill.total_amount then raise exception 'Bill total does not match its charges and adjustments' using errcode='22023'; end if;
  update public.patient_bills set payment_approved_at=now(),payment_approved_by=auth.uid() where id=p_bill_id;
end;
$function$;

create or replace function public.billing_record_patient_payment(p_bill_id uuid,p_amount numeric,p_payment_method text,p_external_reference uuid)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_bill public.patient_bills%rowtype; v_paid numeric(14,2); v_id uuid; v_existing record; v_subtotal numeric(14,2);
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  if p_amount is null or p_amount<=0 or lower(p_amount::text) in ('nan','infinity','-infinity') or p_external_reference is null then raise exception 'Payment amount and idempotency reference are required' using errcode='22023'; end if;
  p_amount:=round(p_amount,2);
  if p_amount<0.01 then raise exception 'Payment amount must be at least one cent' using errcode='22023'; end if;
  select * into v_bill from public.patient_bills where id=p_bill_id for update;
  if not found then raise exception 'Bill not found' using errcode='P0002'; end if;
  if v_bill.is_demo is distinct from false or coalesce(v_bill.bill_number,'') ~* '^DEMO[-_]' then raise exception 'Demo bills cannot receive payments' using errcode='22023'; end if;
  if v_bill.payment_approved_at is null then raise exception 'Approve the bill before recording a payment' using errcode='42501'; end if;
  select id,bill_id,amount into v_existing from public.patient_payments where external_reference=p_external_reference;
  if v_existing.id is not null then
    if v_existing.bill_id<>p_bill_id or v_existing.amount<>p_amount then raise exception 'Payment reference was reused for another payment' using errcode='23505'; end if;
    return v_existing.id;
  end if;
  select round(coalesce(sum(quantity*unit_price),0),2) into v_subtotal from public.patient_medical_charges where bill_id=p_bill_id and patient_id=v_bill.patient_id and is_demo is false;
  if lower(v_bill.approved_discount::text) in ('nan','infinity','-infinity') or lower(v_bill.taxes_and_fees::text) in ('nan','infinity','-infinity') or lower(v_bill.total_amount::text) in ('nan','infinity','-infinity') or round(v_subtotal-v_bill.approved_discount+v_bill.taxes_and_fees,2)<>v_bill.total_amount then raise exception 'Bill total does not match its itemized charges' using errcode='22023'; end if;
  select coalesce(sum(case when p.status in ('completed','paid','succeeded','refunded') and p.is_demo is false then greatest(p.amount-coalesce(r.refund_amount,0),0) else 0 end),0)
    into v_paid from public.patient_payments p
    left join lateral(select sum(x.amount) refund_amount from public.online_payment_refunds x where x.online_payment_id=p.external_reference and x.status='succeeded') r on true
    where p.bill_id=p_bill_id and p.patient_id=v_bill.patient_id and p.is_demo is false;
  if p_amount>v_bill.total_amount-v_paid then raise exception 'Payment exceeds the outstanding balance' using errcode='22023'; end if;
  insert into public.patient_payments(patient_id,bill_id,amount,payment_method,external_reference,receipt_number,status,payment_date,paid_at,is_demo)
    values(v_bill.patient_id,p_bill_id,p_amount,coalesce(p_payment_method,''),p_external_reference,'R-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)),'completed',now(),now(),false)
    returning id into v_id;
  v_paid:=v_paid+p_amount;
  update public.patient_bills set status=case when v_paid>=v_bill.total_amount then 'paid' when v_paid>0 then 'partial' else 'unpaid' end where id=p_bill_id;
  return v_id;
end;
$function$;

create or replace function public.billing_add_existing_supply_charge(p_bill_id uuid,p_charge_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_bill public.patient_bills%rowtype; v_charge public.patient_medical_charges%rowtype; v_subtotal numeric(14,2);
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  select * into v_bill from public.patient_bills where id=p_bill_id for update;
  if not found then raise exception 'Bill not found' using errcode='P0002'; end if;
  if v_bill.is_demo is distinct from false or v_bill.payment_approved_at is not null then raise exception 'Only unapproved, non-demo bills can be changed' using errcode='22023'; end if;
  select * into v_charge from public.patient_medical_charges where id=p_charge_id for update;
  if not found or v_charge.category<>'medical_supply' or v_charge.patient_id<>v_bill.patient_id or v_charge.is_demo is distinct from false then raise exception 'Supply charge is missing, demo, or does not belong to this patient' using errcode='23503'; end if;
  if v_charge.bill_id is not null then raise exception 'This supply charge has already been added to a bill' using errcode='23505'; end if;
  if lower(v_charge.quantity::text) in ('nan','infinity','-infinity') or lower(v_charge.unit_price::text) in ('nan','infinity','-infinity') then raise exception 'Supply charge amount is invalid' using errcode='22023'; end if;
  update public.patient_medical_charges set bill_id=p_bill_id where id=p_charge_id;
  select round(coalesce(sum(quantity*unit_price),0),2) into v_subtotal from public.patient_medical_charges where bill_id=p_bill_id and patient_id=v_bill.patient_id and is_demo is false;
  if v_bill.approved_discount>v_subtotal then raise exception 'Existing discount exceeds the bill subtotal after adding this charge' using errcode='22023'; end if;
  update public.patient_bills set total_amount=round(v_subtotal-approved_discount+taxes_and_fees,2) where id=p_bill_id;
end;
$function$;

create or replace function public.inventory_record_patient_supply(p_patient_id uuid,p_admission_id uuid,p_product_id uuid,p_quantity numeric,p_bill_id uuid default null,p_external_reference uuid default null)
returns uuid language plpgsql security definer set search_path=''
as $function$
declare v_product public.products%rowtype; v_charge uuid; v_total numeric(14,2); v_existing public.patient_medical_charges%rowtype; v_bill public.patient_bills%rowtype;
begin
  if not public.can_manage_patient_area('inventory') then raise exception 'Inventory permission required' using errcode='42501'; end if;
  if p_external_reference is null then raise exception 'A supply-use idempotency reference is required' using errcode='22023'; end if;
  select * into v_existing from public.patient_medical_charges where external_reference=p_external_reference;
  if found then
    if v_existing.patient_id<>p_patient_id or v_existing.inventory_product_id<>p_product_id or v_existing.quantity<>p_quantity then raise exception 'Supply-use reference was reused with different details' using errcode='23505'; end if;
    return v_existing.id;
  end if;
  if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) or lower(p_quantity::text) in ('nan','infinity','-infinity') then raise exception 'Supply quantity must be a positive whole number' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  if p_admission_id is not null and not exists(select 1 from public.patient_admissions a where a.id=p_admission_id and a.patient_id=p_patient_id) then raise exception 'Admission does not belong to this patient' using errcode='23503'; end if;
  select * into v_product from public.products where id=p_product_id and available is true for update;
  if not found then raise exception 'Active inventory item not found' using errcode='P0002'; end if;
  if v_product.stock<p_quantity then raise exception 'Insufficient inventory stock' using errcode='22023'; end if;
  if p_bill_id is not null then
    select * into v_bill from public.patient_bills where id=p_bill_id and patient_id=p_patient_id for update;
    if not found or v_bill.is_demo is distinct from false or v_bill.payment_approved_at is not null then raise exception 'Only an unapproved, non-demo bill for this patient can receive charges' using errcode='23503'; end if;
  end if;
  insert into public.patient_medical_charges(patient_id,admission_id,bill_id,item_name,category,quantity,unit_price,recorded_by,inventory_product_id,external_reference,is_demo)
    values(p_patient_id,p_admission_id,p_bill_id,v_product.name,'medical_supply',p_quantity,v_product.price,auth.uid(),p_product_id,p_external_reference,false) returning id into v_charge;
  update public.products set stock=stock-p_quantity,updated_at=now() where id=p_product_id;
  insert into public.inventory_adjustments(product_id,quantity,note,adjusted_by) values(p_product_id,-p_quantity,'Patient supply use: '||p_patient_id::text,auth.uid());
  if p_bill_id is not null then
    select round(coalesce(sum(quantity*unit_price),0),2) into v_total from public.patient_medical_charges where bill_id=p_bill_id and patient_id=p_patient_id and is_demo is false;
    if v_bill.approved_discount>v_total then raise exception 'Bill discount exceeds charges after the stock charge' using errcode='22023'; end if;
    update public.patient_bills set total_amount=round(v_total-approved_discount+taxes_and_fees,2) where id=p_bill_id;
  end if;
  return v_charge;
end;
$function$;

create or replace function public.payment_prepare_checkout(p_bill_id uuid,p_method text)
returns table(payment_id uuid,amount_cents bigint,idempotency_key text,checkout_session_id text,checkout_url text,payment_status text)
language plpgsql security definer set search_path=''
as $function$
declare v_bill public.patient_bills%rowtype; v_subtotal numeric(12,2); v_total numeric(12,2); v_paid numeric(12,2); v_due numeric(12,2); v_refunds numeric(12,2); v_existing public.online_payments%rowtype; v_id uuid; v_key text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and upper(coalesce(p.role,''))='PATIENT') then raise exception 'A patient account is required' using errcode='42501'; end if;
  if p_method is null or p_method not in ('gcash','paymaya','card') then raise exception 'Unsupported payment method' using errcode='22023'; end if;
  select * into v_bill from public.patient_bills b where b.id=p_bill_id and b.patient_id=auth.uid() for update;
  if not found then raise exception 'Bill not found' using errcode='P0002'; end if;
  if v_bill.is_demo is distinct from false or coalesce(v_bill.bill_number,'') ~* '^DEMO[-_]' then raise exception 'Demo bill is not payable' using errcode='22023'; end if;
  if v_bill.payment_approved_at is null or v_bill.payment_approved_by is null then raise exception 'Bill has not been approved for payment by billing' using errcode='42501'; end if;
  if v_bill.status not in ('unpaid','partial') then raise exception 'Bill is not payable' using errcode='22023'; end if;
  if not exists(select 1 from public.patient_medical_charges c where c.bill_id=v_bill.id and c.patient_id=v_bill.patient_id and c.is_demo is false)
    or exists(select 1 from public.patient_medical_charges c where c.bill_id=v_bill.id and (c.patient_id<>v_bill.patient_id or c.is_demo is distinct from false or c.quantity<=0 or c.unit_price<0 or lower(c.quantity::text) in ('nan','infinity','-infinity') or lower(c.unit_price::text) in ('nan','infinity','-infinity'))) then
    raise exception 'Bill contains unverified charges' using errcode='22023';
  end if;
  select round(coalesce(sum(c.quantity*c.unit_price),0),2) into v_subtotal from public.patient_medical_charges c where c.bill_id=v_bill.id and c.patient_id=v_bill.patient_id and c.is_demo is false;
  if lower(v_bill.approved_discount::text) in ('nan','infinity','-infinity') or lower(v_bill.taxes_and_fees::text) in ('nan','infinity','-infinity') or lower(v_bill.total_amount::text) in ('nan','infinity','-infinity') or v_bill.approved_discount>v_subtotal then raise exception 'Bill adjustments are invalid' using errcode='22023'; end if;
  v_total:=round(v_subtotal-v_bill.approved_discount+v_bill.taxes_and_fees,2);
  if v_total<>v_bill.total_amount then raise exception 'Bill total changed; contact billing for reconciliation' using errcode='22023'; end if;
  select coalesce(sum(case when p.status in ('completed','paid','succeeded','refunded') and p.is_demo is false then greatest(p.amount-coalesce(r.amount,0),0) else 0 end),0)
    into v_paid from public.patient_payments p
    left join lateral (select sum(x.amount) as amount from public.online_payment_refunds x where x.online_payment_id=p.external_reference and x.status='succeeded') r on true
    where p.bill_id=v_bill.id and p.patient_id=v_bill.patient_id and p.is_demo is false;
  v_due:=round(v_total-v_paid,2);
  if v_due<=0 then raise exception 'No outstanding balance' using errcode='22023'; end if;
  select * into v_existing from public.online_payments o where o.bill_id=v_bill.id and o.patient_id=v_bill.patient_id
    and (o.status in ('creating','pending') or (o.status='failed' and o.checkout_session_id is not null))
    order by o.created_at desc limit 1 for update;
  if found then
    if v_existing.payment_method<>p_method then raise exception 'An active checkout already exists using another method' using errcode='22023'; end if;
    if v_existing.idempotency_key is null or v_existing.checkout_url is null or v_existing.checkout_session_id is null then raise exception 'An existing checkout requires billing reconciliation' using errcode='22023'; end if;
    if v_existing.amount<>v_due then raise exception 'The bill changed while checkout is active. Contact billing before continuing.' using errcode='22023'; end if;
    return query select v_existing.id,(v_existing.amount*100)::bigint,v_existing.idempotency_key,v_existing.checkout_session_id,v_existing.checkout_url,v_existing.status; return;
  end if;
  if exists(select 1 from public.online_payments o where o.bill_id=v_bill.id and o.status='creating') then raise exception 'A checkout is being prepared. Please retry shortly' using errcode='55P03'; end if;
  v_id:=gen_random_uuid(); v_key:='medwell-checkout-'||v_id::text;
  insert into public.online_payments(id,patient_id,bill_id,provider,amount,payment_method,idempotency_key)
    values(v_id,v_bill.patient_id,v_bill.id,'paymongo',v_due,p_method,v_key);
  return query select v_id,(v_due*100)::bigint,v_key,null::text,null::text,'creating'::text;
end;
$function$;

drop function if exists public.payment_save_checkout(uuid,text,text,timestamptz);
create function public.payment_save_checkout(p_payment_id uuid,p_session_id text,p_checkout_url text,p_expires_at timestamptz,p_payment_intent_id text)
returns void language plpgsql security definer set search_path=''
as $function$
begin
  update public.online_payments set checkout_session_id=p_session_id,checkout_url=p_checkout_url,status='pending',expires_at=p_expires_at,provider_payment_intent_id=p_payment_intent_id,updated_at=now() where id=p_payment_id and status='creating';
  if not found and not exists(select 1 from public.online_payments where id=p_payment_id and status='pending' and checkout_session_id=p_session_id and checkout_url=p_checkout_url) then raise exception 'Checkout attempt is no longer active'; end if;
end;
$function$;

create or replace function public.payment_process_webhook(p_event_id text,p_event_type text,p_payload jsonb,p_session_id text,p_provider_payment_id text,p_amount_cents bigint,p_currency text,p_method text,p_livemode boolean)
returns text language plpgsql security definer set search_path=''
as $function$
declare v_online public.online_payments%rowtype; v_bill public.patient_bills%rowtype; v_payment uuid; v_attempt_id uuid; v_receipt text; v_paid numeric(12,2); v_subtotal numeric(12,2); v_total numeric(12,2); v_refund_amount numeric(12,2); v_refund_id text;
begin
  if p_livemode is distinct from false then raise exception 'Live mode webhooks are disabled' using errcode='42501'; end if;
  if p_event_id is null or p_event_type is null or p_event_type not in ('checkout_session.payment.paid','refund.succeeded') then raise exception 'Unsupported webhook event' using errcode='22023'; end if;
  insert into public.payment_webhook_events(provider,provider_event_id,event_type,payload,livemode)
    values('paymongo',p_event_id,p_event_type,p_payload,false) on conflict(provider,provider_event_id) do nothing;
  if not found then return 'duplicate'; end if;
  if p_event_type='refund.succeeded' then
    select * into v_online from public.online_payments where provider_payment_id=p_provider_payment_id;
    if not found or p_amount_cents is null or p_amount_cents<=0 or p_currency is distinct from 'PHP' then raise exception 'Unknown payment or invalid refund details'; end if;
    v_attempt_id:=v_online.id;
    select * into v_bill from public.patient_bills where id=v_online.bill_id and patient_id=v_online.patient_id for update;
    if not found then raise exception 'Refund references a missing bill'; end if;
    select * into v_online from public.online_payments where id=v_attempt_id for update;
    if not found or v_online.provider_payment_id is distinct from p_provider_payment_id then raise exception 'Payment reference changed while refund was being processed'; end if;
    v_refund_id:=p_payload#>>'{data,attributes,data,id}';
    v_refund_amount:=p_amount_cents::numeric/100;
    if v_refund_id is null or v_refund_amount+coalesce((select sum(amount) from public.online_payment_refunds where online_payment_id=v_online.id and status='succeeded'),0)>v_online.amount then raise exception 'Refund exceeds remaining payment amount'; end if;
    insert into public.online_payment_refunds(provider_refund_id,online_payment_id,provider_event_id,amount,currency,status)
      values(v_refund_id,v_online.id,p_event_id,v_refund_amount,'PHP','succeeded') on conflict(provider_refund_id) do nothing;
    if not found then update public.payment_webhook_events set processed_at=now(),payment_id=v_online.id where provider='paymongo' and provider_event_id=p_event_id; return 'duplicate'; end if;
    if v_online.patient_payment_id is not null then
      update public.patient_payments set status=case when coalesce((select sum(amount) from public.online_payment_refunds where online_payment_id=v_online.id and status='succeeded'),0)>=v_online.amount then 'refunded' else 'completed' end where id=v_online.patient_payment_id;
    end if;
    update public.online_payments set status=case when coalesce((select sum(amount) from public.online_payment_refunds where online_payment_id=v_online.id and status='succeeded'),0)>=v_online.amount then 'refunded' else 'paid' end,updated_at=now() where id=v_online.id;
    select round(coalesce(sum(quantity*unit_price),0),2) into v_subtotal from public.patient_medical_charges where bill_id=v_online.bill_id and patient_id=v_online.patient_id and is_demo is false;
    select round(v_subtotal-b.approved_discount+b.taxes_and_fees,2) into v_total from public.patient_bills b where b.id=v_online.bill_id;
    select coalesce(sum(case when p.status in ('completed','paid','succeeded','refunded') and p.is_demo is false then greatest(p.amount-coalesce(r.amount,0),0) else 0 end),0)
      into v_paid from public.patient_payments p left join lateral (select sum(x.amount) amount from public.online_payment_refunds x where x.online_payment_id=p.external_reference and x.status='succeeded') r on true where p.bill_id=v_online.bill_id and p.patient_id=v_online.patient_id and p.is_demo is false;
    update public.patient_bills set status=case when v_paid>=v_total then 'paid' when v_paid>0 then 'partial' else 'unpaid' end where id=v_online.bill_id and status in ('unpaid','partial','paid');
    update public.payment_webhook_events set processed_at=now(),payment_id=v_online.id where provider='paymongo' and provider_event_id=p_event_id;
    return 'refunded';
  end if;
  select * into v_online from public.online_payments where checkout_session_id=p_session_id;
  if not found then raise exception 'Unknown checkout session'; end if;
  v_attempt_id:=v_online.id;
  select * into v_bill from public.patient_bills where id=v_online.bill_id and patient_id=v_online.patient_id for update;
  if not found then raise exception 'Bill is missing or not payable'; end if;
  select * into v_online from public.online_payments where id=v_attempt_id for update;
  if not found or v_online.checkout_session_id is distinct from p_session_id then raise exception 'Checkout session changed while payment was being processed'; end if;
  if v_online.status in ('paid','completed') then update public.payment_webhook_events set processed_at=now(),payment_id=v_online.id where provider='paymongo' and provider_event_id=p_event_id; return 'duplicate'; end if;
  if v_online.status not in ('pending','failed') or p_amount_cents is null or p_amount_cents<=0 or v_online.amount*100<>p_amount_cents or p_currency is distinct from 'PHP' or p_method is null or v_online.payment_method<>p_method or p_provider_payment_id is null then raise exception 'Provider payment details do not match an active checkout'; end if;
  if v_bill.is_demo is distinct from false or v_bill.payment_approved_at is null or v_bill.payment_approved_by is null or v_bill.status not in ('unpaid','partial') then raise exception 'Bill is missing or not approved for payment'; end if;
  if exists(select 1 from public.patient_medical_charges where bill_id=v_bill.id and (patient_id<>v_bill.patient_id or is_demo is distinct from false or lower(quantity::text) in ('nan','infinity','-infinity') or lower(unit_price::text) in ('nan','infinity','-infinity'))) then raise exception 'Bill contains demo or mismatched charges'; end if;
  select round(coalesce(sum(quantity*unit_price),0),2) into v_subtotal from public.patient_medical_charges where bill_id=v_bill.id and patient_id=v_bill.patient_id and is_demo is false;
  v_total:=round(v_subtotal-v_bill.approved_discount+v_bill.taxes_and_fees,2);
  if v_total<>v_bill.total_amount then raise exception 'Bill total changed after checkout'; end if;
  select coalesce(sum(case when p.status in ('completed','paid','succeeded','refunded') and p.is_demo is false then greatest(p.amount-coalesce(r.amount,0),0) else 0 end),0)
    into v_paid from public.patient_payments p left join lateral (select sum(x.amount) amount from public.online_payment_refunds x where x.online_payment_id=p.external_reference and x.status='succeeded') r on true where p.bill_id=v_bill.id and p.patient_id=v_bill.patient_id and p.is_demo is false;
  if round(v_total-v_paid,2)<>v_online.amount then raise exception 'Outstanding balance changed after checkout was created'; end if;
  v_receipt:='MW-'||to_char(now() at time zone 'Asia/Manila','YYYYMMDD')||'-'||upper(substr(replace(v_online.id::text,'-',''),1,10));
  insert into public.patient_payments(patient_id,bill_id,amount,payment_method,external_reference,receipt_number,reference_number,status,payment_date,paid_at,is_demo)
    values(v_online.patient_id,v_online.bill_id,v_online.amount,case p_method when 'paymaya' then 'Maya' when 'card' then 'Card' else 'GCash' end,v_online.id,v_receipt,p_provider_payment_id,'completed',now(),now(),false) returning id into v_payment;
  update public.online_payments set status='paid',provider_payment_id=p_provider_payment_id,patient_payment_id=v_payment,reference_number=p_provider_payment_id,paid_at=now(),updated_at=now() where id=v_online.id;
  update public.patient_bills set status='paid' where id=v_bill.id and v_total-v_paid<=v_online.amount;
  update public.payment_webhook_events set processed_at=now(),payment_id=v_online.id where provider='paymongo' and provider_event_id=p_event_id;
  return 'paid';
end;
$function$;

create or replace function public.payment_process_failure(p_event_id text,p_payload jsonb,p_provider_payment_id text,p_payment_intent_id text,p_amount_cents bigint,p_currency text,p_method text,p_livemode boolean)
returns text language plpgsql security definer set search_path=''
as $function$
declare v_online public.online_payments%rowtype;
begin
  if p_livemode is distinct from false then raise exception 'Live mode webhooks are disabled' using errcode='42501'; end if;
  if p_event_id is null or p_amount_cents is null or p_amount_cents<=0 or p_currency is distinct from 'PHP' or p_method is null or p_method not in ('gcash','paymaya','card') or p_payment_intent_id is null or p_provider_payment_id is null then raise exception 'Invalid failed payment event'; end if;
  insert into public.payment_webhook_events(provider,provider_event_id,event_type,payload,livemode) values('paymongo',p_event_id,'payment.failed',p_payload,false) on conflict(provider,provider_event_id) do nothing;
  if not found then return 'duplicate'; end if;
  select * into v_online from public.online_payments where provider_payment_intent_id=p_payment_intent_id for update;
  if not found or v_online.payment_method<>p_method or v_online.amount*100<>p_amount_cents then raise exception 'Failed payment does not match a known checkout attempt'; end if;
  if v_online.status in ('paid','completed','refunded') then
    update public.payment_webhook_events set processed_at=now(),payment_id=v_online.id where provider='paymongo' and provider_event_id=p_event_id;
    return 'ignored_paid';
  end if;
  if v_online.status='pending' then update public.online_payments set status='failed',provider_payment_id=coalesce(provider_payment_id,p_provider_payment_id),failure_reason='PayMongo reported a failed payment attempt',updated_at=now() where id=v_online.id; end if;
  update public.payment_webhook_events set processed_at=now(),payment_id=v_online.id where provider='paymongo' and provider_event_id=p_event_id;
  return 'failed';
end;
$function$;

create or replace function public.payment_mark_expired(p_payment_id uuid,p_final_status text)
returns void language plpgsql security definer set search_path=''
as $function$
begin
  if p_final_status is null or p_final_status not in ('expired','cancelled') then raise exception 'Invalid checkout terminal status'; end if;
  update public.online_payments set status=p_final_status,updated_at=now() where id=p_payment_id and status in ('pending','failed');
  if not found and not exists(select 1 from public.online_payments where id=p_payment_id and status=p_final_status) then raise exception 'Payment attempt is no longer pending'; end if;
end;
$function$;

drop function if exists public.payment_admin_summary();
create function public.payment_admin_summary()
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare result jsonb;
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  select jsonb_build_object(
    'total_attempts',count(*),
    'paid_attempts',count(*) filter(where o.status in ('paid','completed')),
    'pending_attempts',count(*) filter(where o.status in ('creating','pending')),
    'failed_attempts',count(*) filter(where o.status in ('failed','expired','cancelled')),
    'verified_revenue',coalesce((select sum(greatest(p.amount-coalesce(r.refund_amount,0),0)) from public.patient_payments p
      join public.patient_bills b on b.id=p.bill_id and b.is_demo is false
      left join lateral(select sum(x.amount) refund_amount from public.online_payment_refunds x where x.online_payment_id=p.external_reference and x.status='succeeded') r on true
      where p.is_demo is false and p.status in ('completed','paid','succeeded','refunded')),0)
  ) into result from public.online_payments o join public.patient_bills b on b.id=o.bill_id and b.is_demo is false;
  return result;
end;
$function$;

-- Patients may see their own refund entries only; no public or cross-patient access.
grant select on public.online_payment_refunds to authenticated;
drop policy if exists "Patients read own online payment refunds" on public.online_payment_refunds;
create policy "Patients read own online payment refunds" on public.online_payment_refunds for select to authenticated
  using (exists(select 1 from public.online_payments p where p.id=online_payment_id and p.patient_id=(select auth.uid())));

revoke all on function public.billing_create_patient_bill(uuid,uuid,text,numeric,numeric,jsonb,uuid) from public,anon;
revoke all on function public.billing_approve_patient_bill(uuid) from public,anon;
revoke all on function public.billing_record_patient_payment(uuid,numeric,text,uuid) from public,anon;
revoke all on function public.billing_add_existing_supply_charge(uuid,uuid) from public,anon;
revoke all on function public.inventory_record_patient_supply(uuid,uuid,uuid,numeric,uuid,uuid) from public,anon;
revoke all on function public.payment_prepare_checkout(uuid,text) from public,anon;
revoke all on function public.payment_save_checkout(uuid,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.payment_fail_checkout(uuid,text) from public,anon,authenticated;
revoke all on function public.payment_process_webhook(text,text,jsonb,text,text,bigint,text,text,boolean) from public,anon,authenticated;
revoke all on function public.payment_process_failure(text,jsonb,text,text,bigint,text,text,boolean) from public,anon,authenticated;
revoke all on function public.payment_mark_expired(uuid,text) from public,anon,authenticated;
revoke all on function public.payment_admin_summary() from public,anon;
grant execute on function public.billing_create_patient_bill(uuid,uuid,text,numeric,numeric,jsonb,uuid) to authenticated;
grant execute on function public.billing_approve_patient_bill(uuid) to authenticated;
grant execute on function public.billing_record_patient_payment(uuid,numeric,text,uuid) to authenticated;
grant execute on function public.billing_add_existing_supply_charge(uuid,uuid) to authenticated;
grant execute on function public.inventory_record_patient_supply(uuid,uuid,uuid,numeric,uuid,uuid) to authenticated;
grant execute on function public.payment_prepare_checkout(uuid,text) to authenticated;
grant execute on function public.payment_save_checkout(uuid,text,text,timestamptz,text) to service_role;
grant execute on function public.payment_fail_checkout(uuid,text) to service_role;
grant execute on function public.payment_process_webhook(text,text,jsonb,text,text,bigint,text,text,boolean) to service_role;
grant execute on function public.payment_process_failure(text,jsonb,text,text,bigint,text,text,boolean) to service_role;
grant execute on function public.payment_mark_expired(uuid,text) to service_role;
grant execute on function public.payment_admin_summary() to authenticated;

notify pgrst,'reload schema';
commit;
