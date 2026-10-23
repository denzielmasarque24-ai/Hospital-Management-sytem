begin;

-- Prepare a patient-selected partial or full payment against the current
-- server-calculated outstanding balance. The client never supplies authority
-- to pay another patient's bill or exceed its balance.
create or replace function public.payment_prepare_checkout_amount(
  p_bill_id uuid,
  p_method text,
  p_amount numeric
)
returns table(payment_id uuid,amount_cents bigint,idempotency_key text,checkout_session_id text,checkout_url text,payment_status text)
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_bill public.patient_bills%rowtype;
  v_subtotal numeric(12,2);
  v_total numeric(12,2);
  v_paid numeric(12,2);
  v_due numeric(12,2);
  v_existing public.online_payments%rowtype;
  v_id uuid;
  v_key text;
  v_amount numeric(12,2);
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not exists(select 1 from public.profiles p where p.id=auth.uid() and upper(coalesce(p.role::text,''))='PATIENT') then
    raise exception 'A patient account is required' using errcode='42501';
  end if;
  if p_method is null or p_method not in ('gcash','paymaya','card') then raise exception 'Unsupported payment method' using errcode='22023'; end if;
  if p_amount is null or lower(p_amount::text) in ('nan','infinity','-infinity') or p_amount<=0 then raise exception 'Enter a valid payment amount' using errcode='22023'; end if;
  v_amount:=round(p_amount,2);
  if v_amount<0.01 then raise exception 'Payment amount must be at least one cent' using errcode='22023'; end if;

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
  if v_amount>v_due then raise exception 'Payment amount exceeds the outstanding balance' using errcode='22023'; end if;

  select * into v_existing from public.online_payments o where o.bill_id=v_bill.id and o.patient_id=v_bill.patient_id
    and (o.status in ('creating','pending') or (o.status='failed' and o.checkout_session_id is not null))
    order by o.created_at desc limit 1 for update;
  if found then
    if v_existing.payment_method<>p_method then raise exception 'An active checkout already exists using another method' using errcode='22023'; end if;
    if v_existing.amount<>v_amount then raise exception 'An active checkout already exists for a different amount. Continue that checkout or contact billing.' using errcode='22023'; end if;
    if v_existing.idempotency_key is null or v_existing.checkout_url is null or v_existing.checkout_session_id is null then raise exception 'An existing checkout requires billing reconciliation' using errcode='22023'; end if;
    return query select v_existing.id,(v_existing.amount*100)::bigint,v_existing.idempotency_key,v_existing.checkout_session_id,v_existing.checkout_url,v_existing.status;
    return;
  end if;
  if exists(select 1 from public.online_payments o where o.bill_id=v_bill.id and o.status='creating') then raise exception 'A checkout is being prepared. Please retry shortly' using errcode='55P03'; end if;
  v_id:=gen_random_uuid();
  v_key:='medwell-checkout-'||v_id::text;
  insert into public.online_payments(id,patient_id,bill_id,provider,amount,payment_method,idempotency_key)
    values(v_id,v_bill.patient_id,v_bill.id,'paymongo',v_amount,p_method,v_key);
  return query select v_id,(v_amount*100)::bigint,v_key,null::text,null::text,'creating'::text;
end;
$function$;

-- Reconcile partial amounts only after a verified provider webhook. A payment
-- cannot exceed the balance remaining at webhook time; the bill remains partial
-- until confirmed payments cover its full verified total.
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
  if round(v_total-v_paid,2)<v_online.amount then raise exception 'Outstanding balance changed after checkout was created'; end if;
  v_receipt:='MW-'||to_char(now() at time zone 'Asia/Manila','YYYYMMDD')||'-'||upper(substr(replace(v_online.id::text,'-',''),1,10));
  insert into public.patient_payments(patient_id,bill_id,amount,payment_method,external_reference,receipt_number,reference_number,status,payment_date,paid_at,is_demo)
    values(v_online.patient_id,v_online.bill_id,v_online.amount,case p_method when 'paymaya' then 'Maya' when 'card' then 'Card' else 'GCash' end,v_online.id,v_receipt,p_provider_payment_id,'completed',now(),now(),false) returning id into v_payment;
  update public.online_payments set status='paid',provider_payment_id=p_provider_payment_id,patient_payment_id=v_payment,reference_number=p_provider_payment_id,paid_at=now(),updated_at=now() where id=v_online.id;
  update public.patient_bills set status=case when v_total-v_paid<=v_online.amount then 'paid' else 'partial' end where id=v_bill.id and status in ('unpaid','partial');
  update public.payment_webhook_events set processed_at=now(),payment_id=v_online.id where provider='paymongo' and provider_event_id=p_event_id;
  return 'paid';
end;
$function$;

revoke all on function public.payment_prepare_checkout_amount(uuid,text,numeric) from public,anon;
grant execute on function public.payment_prepare_checkout_amount(uuid,text,numeric) to authenticated;
revoke all on function public.payment_process_webhook(text,text,jsonb,text,text,bigint,text,text,boolean) from public,anon,authenticated;
grant execute on function public.payment_process_webhook(text,text,jsonb,text,text,bigint,text,text,boolean) to service_role;

notify pgrst,'reload schema';
commit;
