begin;

-- Patient-specific financial approvals are distinct from clinical review and
-- from a public catalog listing. No historical charges are re-priced.
create table if not exists public.patient_billing_authorizations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  category text not null check(category in ('hospital_service','consultation','room','other','laboratory','diagnostic')),
  description text not null check(length(btrim(description)) between 1 and 500),
  quantity numeric not null check(quantity>0 and quantity<=100000 and quantity=round(quantity,3)),
  unit_price numeric not null check(unit_price>=0 and unit_price<=999999999 and unit_price=round(unit_price,2)),
  supporting_reason text not null check(length(btrim(supporting_reason)) between 1 and 2000),
  service_id uuid references public.services(id),
  care_record_id uuid references public.patient_medical_records(id),
  consultation_record_id uuid references public.patient_medical_records(id),
  doctor_id uuid references public.doctors(id),
  admission_id uuid references public.patient_admissions(id),
  room_id uuid references public.hospital_rooms(id),
  service_date date not null,
  period_start date,
  period_end date,
  approved_by uuid not null references auth.users(id),
  request_hash text not null,
  approved_at timestamptz not null default now()
);
alter table public.patient_billing_authorizations enable row level security;
revoke all on public.patient_billing_authorizations from public,anon,authenticated;
grant select on public.patient_billing_authorizations to authenticated;
drop policy if exists billing_staff_read_financial_authorizations on public.patient_billing_authorizations;
create policy billing_staff_read_financial_authorizations on public.patient_billing_authorizations for select to authenticated using(public.can_manage_patient_area('billing'));
create index if not exists billing_authorizations_patient on public.patient_billing_authorizations(patient_id,approved_at desc);
alter table public.patient_medical_charges add column if not exists billing_authorization_id uuid references public.patient_billing_authorizations(id);
create unique index if not exists billing_one_charge_per_authorization on public.patient_medical_charges(billing_authorization_id) where billing_authorization_id is not null;

create or replace function public.billing_care_is_billable(p_record uuid,p_patient uuid,p_doctor uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_doctor is not null then
    perform id from public.doctors where id=p_doctor and is_demo is false for share;
    if not found then return false; end if;
  end if;
  perform r.id from public.patient_medical_records r left join public.doctors d on d.id=r.doctor_id
    where r.id=p_record and r.patient_id=p_patient and r.is_demo is false and r.demo_key is null
    and lower(coalesce(r.result_status,'')) in ('verified','released','amended')
    and (coalesce(to_jsonb(r)->>'delivery_state','legacy')='legacy' or (to_jsonb(r)->>'delivery_state'='released' and to_jsonb(r)->>'reviewed_at' is not null and to_jsonb(r)->>'released_at' is not null))
    and (p_doctor is null or (r.doctor_id=p_doctor and d.is_demo is false)) for share of r;
  return found;
end; $$;
revoke all on function public.billing_care_is_billable(uuid,uuid,uuid) from public,anon,authenticated;

create or replace function public.billing_approve_charge(p_id uuid,p_patient_id uuid,p_values jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare q public.patient_billing_authorizations; r public.patient_admissions; v_category text; v_qty numeric; v_price numeric; v_start date; v_end date; v_doctor uuid; v_care uuid; v_service uuid; v_room public.hospital_rooms;
begin
  if not public.can_manage_patient_area('billing') or coalesce(public.current_admin_role(),'') not in ('ADMIN','SUPER_ADMIN') then raise exception 'Financial approval requires an authorized hospital administrator' using errcode='42501'; end if;
  if p_id is null or not exists(select 1 from public.profiles where id=p_patient_id and upper(role::text)='PATIENT') then raise exception 'A valid patient and authorization reference are required' using errcode='22023'; end if;
  v_category:=p_values->>'category';
  if coalesce(v_category,'') not in ('hospital_service','consultation','room','other','laboratory','diagnostic') then raise exception 'Select an authorized charge category' using errcode='22023'; end if;
  if length(btrim(coalesce(p_values->>'description',''))) not between 1 and 500 or length(btrim(coalesce(p_values->>'supporting_reason',''))) not between 1 and 2000 then raise exception 'Financial approval requires a description and documented price/delivery basis' using errcode='22023'; end if;
  begin
    if coalesce(p_values->>'quantity','') !~ '^\d+(\.\d{1,3})?$' or coalesce(p_values->>'unit_price','') !~ '^\d+(\.\d{1,2})?$' then raise exception 'Invalid decimals'; end if;
    v_qty:=(p_values->>'quantity')::numeric;v_price:=(p_values->>'unit_price')::numeric;
    v_start:=nullif(p_values->>'period_start','')::date;v_end:=nullif(p_values->>'period_end','')::date;
    if nullif(p_values->>'service_date','') is null then raise exception 'Missing date'; end if;
    perform (p_values->>'service_date')::date;
  exception when others then raise exception 'Use a positive quantity (up to 3 decimals), a verified price (up to 2 decimals), and valid dates' using errcode='22023'; end;
  if v_qty<=0 or v_qty>100000 or v_price<0 or v_price>999999999 then raise exception 'Quantity or unit price is outside the supported range' using errcode='22023'; end if;
  v_care:=nullif(p_values->>'care_record_id','')::uuid;v_doctor:=nullif(p_values->>'doctor_id','')::uuid;v_service:=nullif(p_values->>'service_id','')::uuid;
  if v_category in ('hospital_service','laboratory','diagnostic','consultation') and not public.billing_care_is_billable(v_care,p_patient_id,case when v_category='consultation' then v_doctor end) then raise exception 'A genuine verified care record for this patient is required' using errcode='22023'; end if;
  if v_category='hospital_service' and (v_service is null or not exists(select 1 from public.services s where id=v_service and coalesce((to_jsonb(s)->>'is_demo')::boolean,false)=false)) then raise exception 'A valid genuine service is required; a listing alone does not establish its price' using errcode='22023'; end if;
  if v_category='consultation' and (v_doctor is null or v_qty<>1) then raise exception 'A professional fee requires its verified doctor and quantity 1' using errcode='22023'; end if;
  if v_category='room' then
    select * into r from public.patient_admissions where id=nullif(p_values->>'admission_id','')::uuid and patient_id=p_patient_id and is_demo is false and demo_key is null for share;
    if not found or r.room_id is null then raise exception 'Room charge: A genuine admission with a room assignment is required' using errcode='22023'; end if;
    select * into v_room from public.hospital_rooms where id=r.room_id and is_demo is false for share;
    if not found or v_start is null or v_end is null or v_start>v_end or v_start<(r.admitted_at at time zone 'Asia/Manila')::date or v_end>coalesce((r.discharged_at at time zone 'Asia/Manila')::date,(now() at time zone 'Asia/Manila')::date) or v_qty<>v_end-v_start+1 then raise exception 'Room charge: Verified stay dates and daily quantity must match this genuine admission' using errcode='22023'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,18));
  select * into q from public.patient_billing_authorizations where id=p_id;
  if found then
    if q.patient_id=p_patient_id and q.approved_by=auth.uid() and q.request_hash=encode(sha256(convert_to(p_values::text,'UTF8')),'hex') then return q.id; end if;
    raise exception 'Authorization reference is already in use' using errcode='23505';
  end if;
  insert into public.patient_billing_authorizations(id,patient_id,category,description,quantity,unit_price,supporting_reason,service_id,care_record_id,consultation_record_id,doctor_id,admission_id,room_id,service_date,period_start,period_end,approved_by,request_hash)
  values(p_id,p_patient_id,v_category,btrim(p_values->>'description'),v_qty,v_price,btrim(p_values->>'supporting_reason'),case when v_category='hospital_service' then v_service end,v_care,case when v_category='consultation' then v_care end,case when v_category='consultation' then v_doctor end,case when v_category='room' then r.id end,case when v_category='room' then r.room_id end,(p_values->>'service_date')::date,case when v_category='room' then v_start end,case when v_category='room' then v_end end,auth.uid(),encode(sha256(convert_to(p_values::text,'UTF8')),'hex'));
  return p_id;
end; $$;

create or replace function public.billing_charge_options(p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_approvals jsonb;
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x order by x.approved_at desc),'[]') into v_approvals from (
    select a.*,c.bill_id used_bill_id from public.patient_billing_authorizations a left join public.patient_medical_charges c on c.billing_authorization_id=a.id where a.patient_id=p_patient_id
  ) x;
  return jsonb_build_object('approvals',v_approvals,'canApprove',coalesce(public.current_admin_role(),'') in ('ADMIN','SUPER_ADMIN'));
end; $$;
revoke all on function public.billing_approve_charge(uuid,uuid,jsonb),public.billing_charge_options(uuid) from public,anon;
grant execute on function public.billing_approve_charge(uuid,uuid,jsonb),public.billing_charge_options(uuid) to authenticated;

-- The canonical atomic save function follows. Existing compatibility overloads
-- continue to delegate here; no charge can bypass the verified source checks.

create table if not exists public.patient_billing_save_requests (
  request_id uuid primary key,patient_id uuid not null references public.profiles(id),payload_hash text not null,response jsonb not null,created_at timestamptz not null default now()
);
alter table public.patient_billing_save_requests enable row level security;
revoke all on public.patient_billing_save_requests from public,anon,authenticated;
create or replace function public.billing_item_error(p_index integer,p_field text,p_message text)
returns void language plpgsql set search_path='' as $$
begin
  raise exception 'Item %: %',p_index,p_message using errcode='22023',detail=jsonb_build_object('item_index',p_index-1,'field',p_field)::text;
end; $$;
revoke all on function public.billing_item_error(integer,text,text) from public,anon,authenticated;

create or replace function public.billing_save_patient_bill(
  p_bill_id uuid,
  p_external_reference uuid,
  p_patient_id uuid,
  p_admission_id uuid,
  p_items jsonb,
  p_discount numeric,
  p_discount_reason text,
  p_taxes numeric,
  p_finalize boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_bill uuid;
  v_number text;
  v_existing public.patient_bills%rowtype;
  v_item jsonb;
  v_subtotal numeric(14,2);
  v_total numeric(14,2);
  v_qty numeric;
  v_price numeric;
  v_period_start date;
  v_period_end date;
  v_description text;
  v_product public.products%rowtype;
  v_auth public.patient_billing_authorizations;
  v_index integer:=0;
  v_ref text;
  v_hash text;
  v_response jsonb;
  v_request public.patient_billing_save_requests;
begin
  if not public.can_manage_patient_area('billing') then
    raise exception 'Billing permission required' using errcode='42501';
  end if;
  if p_patient_id is null or p_external_reference is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Patient, idempotency reference, and charge items are required' using errcode='22023';
  end if;
  if jsonb_array_length(p_items)=0 then
    raise exception 'At least one charge is required' using errcode='22023';
  end if;
  if p_discount is null or p_taxes is null or p_discount<0 or p_taxes<0
    or p_discount>999999999 or p_taxes>999999999
    or p_discount<>round(p_discount,2) or p_taxes<>round(p_taxes,2)
    or lower(p_discount::text) in ('nan','infinity','-infinity')
    or lower(p_taxes::text) in ('nan','infinity','-infinity') then
    raise exception 'Discount and taxes must be finite, nonnegative amounts to the nearest cent' using errcode='22023';
  end if;
  if p_finalize is null then raise exception 'Choose whether to save as draft or finalize' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then
    raise exception 'Patient account not found' using errcode='P0002';
  end if;
  if p_admission_id is not null and not exists(
    select 1 from public.patient_admissions a where a.id=p_admission_id and a.patient_id=p_patient_id and coalesce((to_jsonb(a)->>'is_demo')::boolean,false)=false
  ) then raise exception 'Admission does not belong to this patient' using errcode='23503'; end if;

  -- Serialize retries and room period checks. All changes below are atomic.
  perform pg_advisory_xact_lock(hashtextextended(p_external_reference::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text,1));
  v_hash:=encode(sha256(convert_to(jsonb_build_object('bill',p_bill_id,'patient',p_patient_id,'admission',p_admission_id,'items',p_items,'discount',p_discount,'discount_reason',p_discount_reason,'taxes',p_taxes,'finalize',p_finalize)::text,'UTF8')),'hex');
  select * into v_request from public.patient_billing_save_requests where request_id=p_external_reference;
  if found then
    if v_request.patient_id<>p_patient_id or v_request.payload_hash<>v_hash then raise exception 'This save reference was already used for a different payload; reload the saved bill' using errcode='23505'; end if;
    return v_request.response;
  end if;
  if p_bill_id is not null then
    select * into v_existing from public.patient_bills where id=p_bill_id for update;
    if not found or v_existing.patient_id<>p_patient_id or v_existing.is_demo is distinct from false
      or coalesce(v_existing.bill_number,'')~* '^DEMO[-_]' or v_existing.payment_approved_at is not null
      or v_existing.status='paid' then
      raise exception 'Only this patient''s unfinalized genuine draft can be edited' using errcode='42501';
    end if;
    if exists(select 1 from public.patient_payments where bill_id=p_bill_id and patient_id=p_patient_id
      and is_demo is false and status in ('completed','paid','succeeded')) then
      raise exception 'A bill with verified payments cannot be edited' using errcode='55000';
    end if;
    v_bill:=p_bill_id;
    v_number:=v_existing.bill_number;
    delete from public.patient_medical_charges where bill_id=v_bill and patient_id=p_patient_id and is_demo is false;
  else
    select * into v_existing from public.patient_bills where external_reference=p_external_reference for update;
    v_bill:=v_existing.id;
    v_number:=v_existing.bill_number;
    if v_bill is not null then
      select * into v_existing from public.patient_bills where id=v_bill for update;
      if v_existing.patient_id<>p_patient_id or v_existing.is_demo is distinct from false
        or coalesce(v_existing.bill_number,'')~* '^DEMO[-_]' then
        raise exception 'The idempotency reference belongs to a different or finalized bill' using errcode='23505';
      end if;
      if v_existing.payment_approved_at is not null then
        if p_finalize then
          return jsonb_build_object('bill_id',v_existing.id,'bill_number',v_existing.bill_number,
            'total_amount',v_existing.total_amount,'finalized',true);
        end if;
        raise exception 'The idempotency reference already belongs to a finalized bill' using errcode='23505';
      end if;
      if v_existing.status='paid' then
        raise exception 'The idempotency reference belongs to a paid bill' using errcode='23505';
      end if;
      delete from public.patient_medical_charges where bill_id=v_bill and patient_id=p_patient_id and is_demo is false;
    else
      v_number:='B-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
      insert into public.patient_bills(patient_id,admission_id,bill_number,description,total_amount,approved_discount,taxes_and_fees,external_reference,is_demo,status)
        values(p_patient_id,p_admission_id,v_number,'Patient hospital charges',0,0,0,p_external_reference,false,'unpaid') returning id into v_bill;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) entries(value) loop
    v_index:=v_index+1;
    if jsonb_typeof(v_item) is distinct from 'object' then perform public.billing_item_error(v_index,'category','A charge object is required.'); end if;
    if nullif(btrim(v_item->>'description'),'') is null then perform public.billing_item_error(v_index,'description','Description is required.'); end if;
    if coalesce(v_item->>'quantity','') !~ '^\d+(\.\d{1,3})?$' then perform public.billing_item_error(v_index,'quantity','Quantity must be positive with at most 3 decimal places.'); end if;
    if coalesce(v_item->>'unit_price','') !~ '^\d+(\.\d{1,2})?$' then perform public.billing_item_error(v_index,'unitPrice','Verified unit price must be nonnegative with at most 2 decimal places.'); end if;
    foreach v_ref in array array['inventory_product_id','service_id','doctor_id','consultation_record_id','billing_authorization_id'] loop
      if nullif(v_item->>v_ref,'') is not null and (v_item->>v_ref) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then perform public.billing_item_error(v_index,case v_ref when 'inventory_product_id' then 'productId' when 'billing_authorization_id' then 'authorizationId' when 'service_id' then 'serviceId' else 'consultationRecordId' end,'The required record reference is invalid.'); end if;
    end loop;
    begin
      v_qty:=nullif(v_item->>'quantity','')::numeric;
      v_price:=nullif(v_item->>'unit_price','')::numeric;
      v_description:=btrim(coalesce(v_item->>'description',''));
      v_period_start:=nullif(v_item->>'period_start','')::date;
      v_period_end:=nullif(v_item->>'period_end','')::date;
    exception when others then
      perform public.billing_item_error(v_index,'date','Charge quantities, prices, and dates must be valid.');
    end;
    if v_qty is null or v_qty<=0 or v_qty>100000 then perform public.billing_item_error(v_index,'quantity','Quantity must be greater than zero and no more than 100,000.'); end if;
    if v_price is null or v_price<0 or v_price>999999999 then perform public.billing_item_error(v_index,'unitPrice','Unit price is outside the supported range.'); end if;
    if coalesce(v_item->>'category','') not in ('room','consultation','laboratory','diagnostic','medicine','medical_supply','hospital_service','other') then perform public.billing_item_error(v_index,'category','Select an authorized charge category.'); end if;
    begin
      if nullif(v_item->>'service_date','') is null then raise exception 'Missing date'; end if;
      perform (v_item->>'service_date')::date;
    exception when others then perform public.billing_item_error(v_index,'date','A valid service date is required.'); end;
    if v_item->>'category' not in ('medicine','medical_supply') then
      select * into v_auth from public.patient_billing_authorizations where id=nullif(v_item->>'billing_authorization_id','')::uuid and patient_id=p_patient_id and category=v_item->>'category' for share;
      if not found then perform public.billing_item_error(v_index,'authorizationId',case when v_item->>'category'='room' then 'Room charge: An independently verified room rate and documented financial authorization are required.' else 'An approved patient-specific financial authorization is required.' end); end if;
      if v_price<>v_auth.unit_price then perform public.billing_item_error(v_index,'unitPrice','Unit price does not match the approved source.'); end if;
      if v_qty>v_auth.quantity then perform public.billing_item_error(v_index,'quantity','Quantity exceeds the approved quantity.'); end if;
      if (v_item->>'service_date')::date<>v_auth.service_date then perform public.billing_item_error(v_index,'date','Service date must match the financial authorization.'); end if;
      if exists(select 1 from public.patient_medical_charges where billing_authorization_id=v_auth.id) then perform public.billing_item_error(v_index,'authorizationId','This financial authorization is already charged.'); end if;
      if v_auth.care_record_id is not null and not public.billing_care_is_billable(v_auth.care_record_id,p_patient_id,case when v_auth.category='consultation' then v_auth.doctor_id end) then perform public.billing_item_error(v_index,'consultationRecordId','The verified care record is no longer eligible for billing.'); end if;
      if nullif(v_item->>'service_id','')::uuid is distinct from v_auth.service_id then perform public.billing_item_error(v_index,'serviceId','The service must match the financial authorization.'); end if;
      if nullif(v_item->>'consultation_record_id','')::uuid is distinct from v_auth.consultation_record_id or nullif(v_item->>'doctor_id','')::uuid is distinct from v_auth.doctor_id then perform public.billing_item_error(v_index,'consultationRecordId','The verified consultation and doctor must match the financial authorization.'); end if;
      if nullif(v_item->>'inventory_product_id','') is not null then perform public.billing_item_error(v_index,'productId','Only medicine or medical supply charges may reference an inventory product.'); end if;
    else
      v_auth:=null;
      if nullif(v_item->>'service_id','') is not null or nullif(v_item->>'consultation_record_id','') is not null or nullif(v_item->>'doctor_id','') is not null then perform public.billing_item_error(v_index,'productId','Inventory charges cannot carry service or professional-fee references.'); end if;
    end if;
    if v_item->>'category' in ('medicine','medical_supply') and nullif(v_item->>'inventory_product_id','') is null then
      perform public.billing_item_error(v_index,'productId','Medical supply: Please select a valid catalog product.');
    end if;
    if nullif(v_item->>'inventory_product_id','') is not null then
      if v_qty<>trunc(v_qty) then perform public.billing_item_error(v_index,'quantity','Inventory product quantities must be whole numbers.'); end if;
      select * into v_product from public.products where id=(v_item->>'inventory_product_id')::uuid and available is true for update;
      if not found or v_product.stock<v_qty or v_product.price<>v_price or coalesce((to_jsonb(v_product)->>'is_demo')::boolean,false) then
        perform public.billing_item_error(v_index,case when not found or v_product.stock<v_qty or coalesce((to_jsonb(v_product)->>'is_demo')::boolean,false) then 'productId' else 'unitPrice' end,'Product is unavailable, out of stock, demo, or its approved catalog price changed.');
      end if;
      v_description:=v_product.name;
      if p_finalize then
        update public.products set stock=stock-v_qty,updated_at=now() where id=v_product.id and stock>=v_qty;
        if not found then raise exception 'Insufficient product stock at finalization' using errcode='22023'; end if;
        insert into public.inventory_adjustments(product_id,quantity,note,adjusted_by)
          values(v_product.id,-v_qty,'Patient bill '||coalesce(v_number,v_bill::text),auth.uid());
      end if;
    end if;
    if nullif(v_item->>'service_id','') is not null then
      select s.name into v_description from public.services s where s.id=(v_item->>'service_id')::uuid and coalesce((to_jsonb(s)->>'is_demo')::boolean,false)=false for share;
      if not found then perform public.billing_item_error(v_index,'serviceId','Selected service could not be verified as a genuine billable service.'); end if;
    end if;
    if v_item->>'category'='hospital_service' and nullif(v_item->>'service_id','') is null then
      raise exception 'Hospital services must reference an existing service record' using errcode='22023';
    end if;
    if v_item->>'category'='consultation' then
      if v_qty<>1 then perform public.billing_item_error(v_index,'quantity','Doctor fee quantity must be 1.'); end if;
      if exists(select 1 from public.patient_medical_charges where patient_id=p_patient_id and consultation_record_id=nullif(v_item->>'consultation_record_id','')::uuid and is_demo is false) then perform public.billing_item_error(v_index,'consultationRecordId','This consultation already has a saved professional fee.'); end if;
      if nullif(v_item->>'consultation_record_id','') is null then
        raise exception 'Professional fees must reference a released care record for this patient and doctor' using errcode='22023';
      end if;
      select concat_ws(' · ',nullif(btrim(r.title),''),'Dr. '||d.display_name)
        into v_description from public.patient_medical_records r join public.doctors d on d.id=r.doctor_id
        where r.id=(v_item->>'consultation_record_id')::uuid and r.patient_id=p_patient_id
          and r.doctor_id=nullif(v_item->>'doctor_id','')::uuid
          and lower(coalesce(r.result_status,'')) in ('released','verified','amended')
          and r.is_demo is false
          and coalesce((to_jsonb(d)->>'is_demo')::boolean,false)=false
          and (p_admission_id is null or exists(select 1 from public.patient_admissions a where a.id=p_admission_id and a.patient_id=p_patient_id and coalesce((to_jsonb(a)->>'is_demo')::boolean,false)=false));
      if not found then raise exception 'Professional fees must reference a released care record for this patient and doctor' using errcode='22023'; end if;
    end if;
    if v_item->>'category'='other' and nullif(btrim(v_item->>'supporting_reason'),'') is null then
      perform public.billing_item_error(v_index,'reason','Additional charge: Supporting reason is required.');
    end if;
    if v_item->>'category'='room' then
      if v_period_start is distinct from v_auth.period_start or v_period_end is distinct from v_auth.period_end or v_qty<>v_auth.quantity then perform public.billing_item_error(v_index,'period','Room charge: Stay dates and daily quantity must match the approved rate authorization.'); end if;
      perform a.id from public.patient_admissions a join public.hospital_rooms r on r.id=a.room_id where a.id=v_auth.admission_id and a.patient_id=p_patient_id and a.room_id=v_auth.room_id and a.is_demo is false and a.demo_key is null and r.is_demo is false and v_period_start>=(a.admitted_at at time zone 'Asia/Manila')::date and v_period_end<=coalesce((a.discharged_at at time zone 'Asia/Manila')::date,(now() at time zone 'Asia/Manila')::date) for share of a,r;
      if not found then perform public.billing_item_error(v_index,'period','Room charge: Verified room, admission, or stay dates are no longer eligible.'); end if;
      if exists(select 1 from public.patient_medical_charges c where c.patient_id=p_patient_id and c.admission_id=v_auth.admission_id and c.category='room' and c.is_demo is false and (c.service_period_start is null or c.service_period_end is null or daterange(c.service_period_start,c.service_period_end,'[]') && daterange(v_period_start,v_period_end,'[]'))) then perform public.billing_item_error(v_index,'period','Room charge: This stay overlaps an existing accommodation charge.'); end if;
    end if;
    insert into public.patient_medical_charges(patient_id,admission_id,bill_id,item_name,category,quantity,unit_price,
      recorded_by,inventory_product_id,supporting_reason,service_id,professional_doctor_id,consultation_record_id,
      service_date,service_period_start,service_period_end,is_demo,billing_authorization_id)
    values(p_patient_id,case when v_item->>'category'='room' then v_auth.admission_id else p_admission_id end,v_bill,v_description,v_item->>'category',v_qty,v_price,auth.uid(),
      nullif(v_item->>'inventory_product_id','')::uuid,nullif(btrim(v_item->>'supporting_reason'),''),
      nullif(v_item->>'service_id','')::uuid,nullif(v_item->>'doctor_id','')::uuid,
      nullif(v_item->>'consultation_record_id','')::uuid,
      coalesce(nullif(v_item->>'service_date','')::date,current_date),v_period_start,v_period_end,false,v_auth.id);
  end loop;

  select round(coalesce(sum(quantity*unit_price),0),2) into v_subtotal from public.patient_medical_charges
    where bill_id=v_bill and patient_id=p_patient_id and is_demo is false;
  if p_discount>v_subtotal then raise exception 'Discount cannot exceed the subtotal' using errcode='22023'; end if;
  if p_discount>0 and nullif(btrim(p_discount_reason),'') is null then
    raise exception 'An approval reason is required for a discount' using errcode='22023';
  end if;
  v_total:=round(v_subtotal-p_discount+p_taxes,2);
  if v_subtotal>9999999999.99 or v_total>9999999999.99 then
    raise exception 'Bill total exceeds the supported maximum' using errcode='22003';
  end if;
  update public.patient_bills set admission_id=p_admission_id,total_amount=v_total,approved_discount=p_discount,
    discount_reason=nullif(btrim(p_discount_reason),''),taxes_and_fees=p_taxes,description='Patient hospital charges'
    where id=v_bill;
  if p_finalize then
    if exists(select 1 from public.online_payments where bill_id=v_bill and status in ('creating','pending')) then
      raise exception 'Resolve active payment attempts before finalizing this bill' using errcode='55000';
    end if;
    update public.patient_bills set payment_approved_at=now(),payment_approved_by=auth.uid(),issued_at=now()
      where id=v_bill and is_demo is false and payment_approved_at is null;
  end if;
  v_response:=jsonb_build_object('bill_id',v_bill,'bill_number',v_number,'total_amount',v_total,'finalized',p_finalize);
  insert into public.patient_billing_save_requests(request_id,patient_id,payload_hash,response) values(p_external_reference,p_patient_id,v_hash,v_response);
  return v_response;
end;
$$;

revoke all on function public.billing_save_patient_bill(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean) from public,anon;
grant execute on function public.billing_save_patient_bill(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean) to authenticated;

do $verify_billing_rpc_signatures$
declare
  v_options oid := to_regprocedure('public.billing_charge_options(uuid)');
  v_save oid := to_regprocedure('public.billing_save_patient_bill(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean)');
  v_option_args text[];
begin
  if v_options is null then
    raise exception 'billing_charge_options(uuid) was not created';
  end if;
  select proargnames into v_option_args from pg_proc where oid=v_options;
  if v_option_args[1:1] is distinct from array['p_patient_id']::text[] then
    raise exception 'billing_charge_options argument name does not match the frontend';
  end if;
  if not has_function_privilege('authenticated',v_options,'EXECUTE')
    or has_function_privilege('anon',v_options,'EXECUTE') then
    raise exception 'billing_charge_options must be executable by authenticated users only';
  end if;
  if v_save is null or not has_function_privilege('authenticated',v_save,'EXECUTE') then
    raise exception 'billing_save_patient_bill signature or authenticated grant is missing';
  end if;
end;
$verify_billing_rpc_signatures$;

notify pgrst,'reload schema';
commit;
