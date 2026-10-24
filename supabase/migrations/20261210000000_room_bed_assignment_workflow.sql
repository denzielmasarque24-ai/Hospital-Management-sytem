begin;

-- Keep a patient's active placement singular, and retain the rate agreed at
-- assignment time so later catalog edits cannot rewrite an existing stay.
alter table public.patient_beds drop constraint if exists patient_beds_status_check;
alter table public.patient_beds add constraint patient_beds_status_check
  check (status in ('available','occupied','reserved','cleaning','maintenance'));
alter table public.patient_beds add column if not exists bed_type text not null default 'Standard';
alter table public.patient_beds add column if not exists reserved_for_admission_id uuid references public.patient_admissions(id) on delete set null;
alter table public.patient_room_assignments add column if not exists notes text not null default '';
alter table public.patient_room_assignments add column if not exists assigned_by uuid references auth.users(id) on delete set null;
alter table public.patient_room_assignments add column if not exists daily_rate numeric(12,2);
alter table public.patient_room_assignments drop constraint if exists patient_room_assignments_daily_rate_check;
alter table public.patient_room_assignments add constraint patient_room_assignments_daily_rate_check check (daily_rate is null or daily_rate >= 0);

create unique index if not exists patient_room_assignments_one_active_patient_idx
  on public.patient_room_assignments(patient_id) where status='assigned';

-- Existing admissions without an assignment can still be initialized from the
-- same drawer. Keep this RPC in sync with the atomic assign/transfer function.
create or replace function public.admin_activate_patient_admission(p_admission_id uuid,p_bed_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_patient uuid;v_room record;v_rate numeric;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  select patient_id into v_patient from public.patient_admissions where id=p_admission_id and status='pending' for update;
  if not found then raise exception 'Pending admission not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_patient::text,0));
  if exists(select 1 from public.patient_admissions where patient_id=v_patient and status='admitted') then raise exception 'Patient already has an active admission' using errcode='23505'; end if;
  if exists(select 1 from public.patient_room_assignments where patient_id=v_patient and status='assigned') then raise exception 'Patient already has an active room assignment' using errcode='23505'; end if;
  if p_bed_id is not null then
    select b.id,b.bed_number,b.bed_type,b.status bed_status,b.room_id,r.room_number,r.category,r.floor_or_ward,r.status room_status
      into v_room from public.patient_beds b join public.patient_rooms r on r.id=b.room_id where b.id=p_bed_id for update of b,r;
    if not found or v_room.bed_status<>'available' or v_room.room_status in ('cleaning','maintenance') then raise exception 'Selected bed or room is not available' using errcode='23505'; end if;
    select c.daily_rate into v_rate from public.room_categories c where c.slug=lower(regexp_replace(trim(v_room.category),'[^a-zA-Z0-9]+','-','g')) and c.is_active is true and c.is_demo_rate is false;
    update public.patient_beds set status='occupied' where id=p_bed_id;
    update public.patient_rooms set status='occupied' where id=v_room.room_id;
    insert into public.patient_room_assignments(admission_id,patient_id,bed_id,room_number,bed_number,room_type,floor_or_ward,status,daily_rate,assigned_by)
      values(p_admission_id,v_patient,p_bed_id,v_room.room_number,v_room.bed_number,v_room.category,v_room.floor_or_ward,'assigned',v_rate,auth.uid());
  end if;
  update public.patient_admissions set status='admitted' where id=p_admission_id;
end; $$;

create or replace function public.admin_room_bed_directory(p_search text default '')
returns table(room_id uuid,room_number text,category text,floor_or_ward text,room_status text,
  bed_id uuid,bed_number text,bed_type text,bed_status text,reserved_for_admission_id uuid,daily_rate numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  return query
  select r.id,r.room_number,r.category,r.floor_or_ward,r.status,b.id,b.bed_number,b.bed_type,b.status,b.reserved_for_admission_id,
    case when c.is_active is true and c.is_demo_rate is false then c.daily_rate else null end
  from public.patient_rooms r join public.patient_beds b on b.room_id=r.id
  left join public.room_categories c on c.slug=lower(regexp_replace(trim(r.category),'[^a-zA-Z0-9]+','-','g'))
  where coalesce(p_search,'')='' or r.room_number ilike '%'||p_search||'%' or r.category ilike '%'||p_search||'%'
    or r.floor_or_ward ilike '%'||p_search||'%' or b.bed_number ilike '%'||p_search||'%'
  order by r.room_number,b.bed_number;
end; $$;

create or replace function public.admin_assign_patient_bed(
  p_admission_id uuid,p_bed_id uuid,p_assigned_at timestamptz default now(),p_notes text default '',p_transfer_reason text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_patient uuid; v_admission_status text; v_old public.patient_room_assignments%rowtype;
  v_bed record; v_rate numeric; v_new_id uuid; v_assigned timestamptz:=coalesce(p_assigned_at,now());
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  select a.patient_id,a.status into v_patient,v_admission_status from public.patient_admissions a where a.id=p_admission_id for update;
  if not found or v_admission_status<>'admitted' then raise exception 'Patient must have an active admission before assigning a bed' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_patient::text,0));
  select * into v_old from public.patient_room_assignments where patient_id=v_patient and status='assigned' for update;
  if not found and exists(select 1 from public.patient_room_assignments where patient_id=v_patient and status='assigned') then
    raise exception 'Patient room assignment changed concurrently; refresh and retry' using errcode='40001';
  end if;
  if found and v_old.admission_id<>p_admission_id then raise exception 'This patient already has a room assignment on another admission' using errcode='23505'; end if;
  if v_old.id is not null and v_old.bed_id=p_bed_id then raise exception 'This bed is already assigned to the patient' using errcode='22023'; end if;
  if v_old.id is not null and (nullif(btrim(p_transfer_reason),'') is null or v_assigned<=v_old.assigned_at) then
    raise exception 'A transfer requires a reason and a time after the current assignment' using errcode='22023'; end if;
  select b.id bed_id,b.bed_number,b.bed_type,b.status bed_status,b.room_id,r.room_number,r.category,r.floor_or_ward,r.status room_status
    into v_bed from public.patient_beds b join public.patient_rooms r on r.id=b.room_id where b.id=p_bed_id for update of b,r;
  if not found or v_bed.bed_status<>'available' or v_bed.room_status in ('cleaning','maintenance') then
    raise exception 'Selected bed or room is not available' using errcode='23505'; end if;
  select c.daily_rate into v_rate from public.room_categories c where c.slug=lower(regexp_replace(trim(v_bed.category),'[^a-zA-Z0-9]+','-','g'))
    and c.is_active is true and c.is_demo_rate is false;
  if v_old.id is not null then
    update public.patient_room_assignments set status='released',released_at=v_assigned,released_reason='transfer: '||btrim(p_transfer_reason)
      where id=v_old.id;
    update public.patient_beds set status='cleaning',reserved_for_admission_id=null where id=v_old.bed_id;
    update public.patient_rooms r set status=case
      when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='occupied') then 'occupied'
      when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='available') then 'available'
      when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='cleaning') then 'cleaning' else 'maintenance' end
      where r.id=(select room_id from public.patient_beds where id=v_old.bed_id);
  end if;
  update public.patient_beds set status='occupied',reserved_for_admission_id=null where id=p_bed_id;
  update public.patient_rooms set status='occupied' where id=v_bed.room_id;
  insert into public.patient_room_assignments(admission_id,patient_id,bed_id,room_number,bed_number,room_type,floor_or_ward,status,assigned_at,notes,assigned_by,daily_rate)
    values(p_admission_id,v_patient,p_bed_id,v_bed.room_number,v_bed.bed_number,v_bed.category,v_bed.floor_or_ward,'assigned',v_assigned,
      nullif(btrim(concat_ws(E'\n',nullif(btrim(p_notes),''),case when v_old.id is not null then 'Transfer reason: '||btrim(p_transfer_reason) end)),''),auth.uid(),v_rate)
    returning id into v_new_id;
  return jsonb_build_object('assignment_id',v_new_id,'transferred',v_old.id is not null,'daily_rate',v_rate,'assigned_at',v_assigned);
end; $$;

create or replace function public.admin_set_patient_bed_inventory_status(p_bed_id uuid,p_status text,p_reserved_admission_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_room uuid;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  if p_status not in ('available','reserved','cleaning','maintenance') then raise exception 'Choose available, reserved, cleaning, or maintenance' using errcode='22023'; end if;
  if p_status='reserved' and (p_reserved_admission_id is null or not exists(select 1 from public.patient_admissions where id=p_reserved_admission_id and status='admitted')) then
    raise exception 'Reserved beds must be linked to an active admission' using errcode='22023'; end if;
  if p_status='reserved' and exists(select 1 from public.patient_beds where reserved_for_admission_id=p_reserved_admission_id and status='reserved' and id<>p_bed_id) then
    raise exception 'This admission already has a reserved bed' using errcode='23505'; end if;
  update public.patient_beds b set status=p_status,reserved_for_admission_id=case when p_status='reserved' then p_reserved_admission_id else null end
    where b.id=p_bed_id and b.status<>'occupied' and not exists(select 1 from public.patient_room_assignments a where a.bed_id=b.id and a.status='assigned') returning room_id into v_room;
  if not found then raise exception 'Bed not found or currently assigned' using errcode='P0002'; end if;
  update public.patient_rooms r set status=case
    when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='occupied') then 'occupied'
    when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='available') then 'available'
    when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='cleaning') then 'cleaning' else 'maintenance' end where r.id=v_room;
end; $$;

create or replace function public.billing_patient_care_details(p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_admission public.patient_admissions%rowtype; v_room public.patient_room_assignments%rowtype; v_doctor_name text; v_specialty text; v_rate numeric;
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  select * into v_admission from public.patient_admissions a where a.patient_id=p_patient_id and a.status in ('admitted','discharged') order by a.admission_date desc limit 1;
  if v_admission.id is not null then
    select * into v_room from public.patient_room_assignments r where r.admission_id=v_admission.id and r.patient_id=p_patient_id
      and (v_admission.status='discharged' or r.status='assigned') order by r.assigned_at desc limit 1;
    if v_admission.doctor_id is not null then select 'Dr. '||d.first_name||' '||d.last_name,d.specialization into v_doctor_name,v_specialty from public.doctors d where d.id=v_admission.doctor_id; end if;
    v_rate:=v_room.daily_rate;
    if v_rate is null and v_room.room_type is not null then select c.daily_rate into v_rate from public.room_categories c
      where c.slug=lower(regexp_replace(trim(v_room.room_type),'[^a-zA-Z0-9]+','-','g')) and c.is_active is true and c.is_demo_rate is false limit 1; end if;
  end if;
  return jsonb_build_object('admission_id',v_admission.id,'admission_number',v_admission.admission_number,'admission_status',v_admission.status,
    'admission_date',v_admission.admission_date,'discharge_date',v_admission.discharge_date,'doctor_id',v_admission.doctor_id,'doctor_name',v_doctor_name,'specialty',v_specialty,
    'room_assignment_id',v_room.id,'room_number',v_room.room_number,'room_type',v_room.room_type,'room_start_date',v_room.assigned_at::date,'room_end_date',v_room.released_at::date,
    'daily_rate',v_rate,'bed_id',v_room.bed_id,'bed_number',v_room.bed_number,'assignment_notes',v_room.notes);
end; $$;

-- Room billing must use the rate captured on the actual assignment. A rate
-- entered by staff remains allowed only when the assignment had no approved
-- non-demo rate at the time it was created.
create or replace function public.billing_save_patient_bill(
  p_bill_id uuid,p_external_reference uuid,p_patient_id uuid,p_admission_id uuid,p_items jsonb,
  p_discount numeric,p_discount_reason text,p_taxes numeric,p_finalize boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_bill uuid;v_number text;v_existing public.patient_bills%rowtype;v_item jsonb;v_subtotal numeric(14,2);v_total numeric(14,2);
  v_qty numeric;v_price numeric;v_period_start date;v_period_end date;v_description text;v_room record;v_product public.products%rowtype;
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  if p_patient_id is null or p_external_reference is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'Patient, idempotency reference, and at least one item are required' using errcode='22023'; end if;
  if coalesce(p_discount,0)<0 or coalesce(p_taxes,0)<0 or p_discount<>round(p_discount,2) or p_taxes<>round(p_taxes,2) then raise exception 'Discount and fees must be valid nonnegative amounts' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  if p_admission_id is not null and not exists(select 1 from public.patient_admissions a where a.id=p_admission_id and a.patient_id=p_patient_id) then raise exception 'Admission does not belong to this patient' using errcode='23503'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_external_reference::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text,1));
  if p_bill_id is not null then
    select * into v_existing from public.patient_bills where id=p_bill_id for update;
    if not found or v_existing.patient_id<>p_patient_id or v_existing.is_demo is distinct from false or coalesce(v_existing.bill_number,'')~* '^DEMO[-_]' or v_existing.payment_approved_at is not null or v_existing.status='paid' then raise exception 'Only this patient''s unfinalized genuine draft can be edited' using errcode='42501'; end if;
    if exists(select 1 from public.patient_payments where bill_id=p_bill_id and is_demo is false and status in ('completed','paid','succeeded')) then raise exception 'A bill with verified payments cannot be edited' using errcode='55000'; end if;
    v_bill:=p_bill_id;v_number:=v_existing.bill_number;delete from public.patient_medical_charges where bill_id=v_bill and patient_id=p_patient_id and is_demo is false;
  else
    select * into v_existing from public.patient_bills where external_reference=p_external_reference for update;v_bill:=v_existing.id;v_number:=v_existing.bill_number;
    if v_bill is not null then
      select * into v_existing from public.patient_bills where id=v_bill for update;
      if v_existing.patient_id<>p_patient_id or v_existing.is_demo is distinct from false or coalesce(v_existing.bill_number,'')~* '^DEMO[-_]' or v_existing.payment_approved_at is not null or v_existing.status='paid' then raise exception 'The idempotency reference belongs to a different or finalized bill' using errcode='23505'; end if;
      delete from public.patient_medical_charges where bill_id=v_bill and patient_id=p_patient_id and is_demo is false;
    else
      v_number:='B-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
      insert into public.patient_bills(patient_id,admission_id,bill_number,description,total_amount,approved_discount,taxes_and_fees,external_reference,is_demo,status) values(p_patient_id,p_admission_id,v_number,'Patient hospital charges',0,0,0,p_external_reference,false,'unpaid') returning id into v_bill;
    end if;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) entries(value) loop
    v_qty:=nullif(v_item->>'quantity','')::numeric;v_price:=nullif(v_item->>'unit_price','')::numeric;v_description:=btrim(coalesce(v_item->>'description',''));
    if v_description='' or v_qty is null or v_qty<=0 or v_qty>100000 or v_qty<>round(v_qty,3) or v_price is null or v_price<0 or v_price>999999999 or v_price<>round(v_price,2)
      or coalesce(v_item->>'category','') not in ('room','consultation','laboratory','diagnostic','medicine','medical_supply','hospital_service','other') then raise exception 'Each item requires a valid description, category, positive quantity, and verified price' using errcode='22023'; end if;
    if v_item->>'category' in ('medicine','medical_supply') and nullif(v_item->>'inventory_product_id','') is null then raise exception 'Medical products and supplies must reference a catalog product' using errcode='22023'; end if;
    if nullif(v_item->>'inventory_product_id','') is not null then
      if v_qty<>trunc(v_qty) then raise exception 'Product supply quantities must be whole numbers' using errcode='22023'; end if;
      select * into v_product from public.products where id=(v_item->>'inventory_product_id')::uuid and available is true for share;
      if not found or v_product.stock<v_qty or v_product.price<>v_price then raise exception 'Product is unavailable, out of stock, or its catalog price changed' using errcode='22023'; end if;
      v_description:=v_product.name;
      if p_finalize then update public.products set stock=stock-v_qty,updated_at=now() where id=v_product.id and stock>=v_qty; if not found then raise exception 'Insufficient product stock at finalization' using errcode='22023'; end if; insert into public.inventory_adjustments(product_id,quantity,note,adjusted_by) values(v_product.id,-v_qty,'Patient bill '||coalesce(v_number,v_bill::text),auth.uid()); end if;
    end if;
    if nullif(v_item->>'service_id','') is not null then select s.name into v_description from public.services s where s.id=(v_item->>'service_id')::uuid; if not found then raise exception 'Selected service could not be verified' using errcode='22023'; end if; end if;
    if v_item->>'category'='hospital_service' and nullif(v_item->>'service_id','') is null then raise exception 'Hospital services must reference an existing service record' using errcode='22023'; end if;
    if v_item->>'category'='consultation' then
      if nullif(v_item->>'consultation_record_id','') is null then raise exception 'Professional fees must reference a released care record for this patient and doctor' using errcode='22023'; end if;
      select concat_ws(' · ',nullif(btrim(r.reason),''),'Dr. '||d.first_name||' '||d.last_name) into v_description from public.patient_medical_records r join public.doctors d on d.id=r.doctor_id where r.id=(v_item->>'consultation_record_id')::uuid and r.patient_id=p_patient_id and r.doctor_id=nullif(v_item->>'doctor_id','')::uuid and r.status in ('released','amended') and r.released_at is not null;
      if not found then raise exception 'Professional fees must reference a released care record for this patient and doctor' using errcode='22023'; end if;
    end if;
    if v_item->>'category'='other' and nullif(btrim(v_item->>'supporting_reason'),'') is null then raise exception 'Additional charges require a supporting reason' using errcode='22023'; end if;
    v_period_start:=nullif(v_item->>'period_start','')::date;v_period_end:=nullif(v_item->>'period_end','')::date;
    if v_item->>'category'='room' then
      if v_period_start is null or v_period_end is null or v_period_end<v_period_start or v_qty<>(v_period_end-v_period_start+1) then raise exception 'Room charge dates and billable days must match' using errcode='22023'; end if;
      if p_admission_id is null or nullif(v_item->>'room_assignment_id','') is null then raise exception 'Room charges require the patient''s actual room assignment' using errcode='22023'; end if;
      select ra.id,ra.room_number,ra.daily_rate,ra.assigned_at,ra.released_at into v_room from public.patient_room_assignments ra where ra.id=(v_item->>'room_assignment_id')::uuid and ra.patient_id=p_patient_id and ra.admission_id=p_admission_id for share;
    if not found or v_period_start<v_room.assigned_at::date or v_period_end>coalesce(v_room.released_at::date,current_date) then raise exception 'Room charges must match this patient''s actual room assignment and dates' using errcode='22023'; end if;
      if v_room.daily_rate is not null and v_price<>v_room.daily_rate then raise exception 'Room daily price must match the approved rate captured on this assignment' using errcode='22023'; end if;
      v_description:='Room '||v_room.room_number||' accommodation';
      if exists(select 1 from public.patient_medical_charges c where c.patient_id=p_patient_id and c.category='room' and c.is_demo is false and c.service_period_start is not null and c.service_period_end is not null and c.service_period_start<=v_period_end and c.service_period_end>=v_period_start and (p_bill_id is null or c.bill_id is distinct from p_bill_id)) then raise exception 'This room period overlaps another saved bill charge' using errcode='23P01'; end if;
    end if;
    insert into public.patient_medical_charges(patient_id,admission_id,bill_id,item_name,category,quantity,unit_price,recorded_by,inventory_product_id,supporting_reason,service_id,professional_doctor_id,consultation_record_id,room_assignment_id,service_date,service_period_start,service_period_end,is_demo)
    values(p_patient_id,p_admission_id,v_bill,v_description,v_item->>'category',v_qty,v_price,auth.uid(),nullif(v_item->>'inventory_product_id','')::uuid,nullif(btrim(v_item->>'supporting_reason'),''),nullif(v_item->>'service_id','')::uuid,nullif(v_item->>'doctor_id','')::uuid,nullif(v_item->>'consultation_record_id','')::uuid,nullif(v_item->>'room_assignment_id','')::uuid,coalesce(nullif(v_item->>'service_date','')::date,current_date),v_period_start,v_period_end,false);
  end loop;
  select round(coalesce(sum(quantity*unit_price),0),2) into v_subtotal from public.patient_medical_charges where bill_id=v_bill and patient_id=p_patient_id and is_demo is false;
  if p_discount>v_subtotal then raise exception 'Discount cannot exceed the subtotal' using errcode='22023'; end if;
  if coalesce(p_discount,0)>0 and nullif(btrim(p_discount_reason),'') is null then raise exception 'An approval reason is required for a discount' using errcode='22023'; end if;
  v_total:=round(v_subtotal-coalesce(p_discount,0)+coalesce(p_taxes,0),2);
  update public.patient_bills set admission_id=p_admission_id,total_amount=v_total,approved_discount=coalesce(p_discount,0),discount_reason=nullif(btrim(p_discount_reason),''),taxes_and_fees=coalesce(p_taxes,0),description='Patient hospital charges' where id=v_bill;
  if p_finalize then
    if exists(select 1 from public.online_payments where bill_id=v_bill and status in ('creating','pending')) then raise exception 'Resolve active payment attempts before finalizing this bill' using errcode='55000'; end if;
    update public.patient_bills set payment_approved_at=now(),payment_approved_by=auth.uid(),issued_at=now() where id=v_bill and is_demo is false and payment_approved_at is null;
  end if;
  return jsonb_build_object('bill_id',v_bill,'bill_number',v_number,'total_amount',v_total,'finalized',p_finalize);
end; $$;

revoke all on function public.admin_room_bed_directory(text) from public,anon;
grant execute on function public.admin_room_bed_directory(text) to authenticated;
revoke all on function public.admin_activate_patient_admission(uuid,uuid) from public,anon;
grant execute on function public.admin_activate_patient_admission(uuid,uuid) to authenticated;
revoke all on function public.admin_assign_patient_bed(uuid,uuid,timestamptz,text,text) from public,anon;
grant execute on function public.admin_assign_patient_bed(uuid,uuid,timestamptz,text,text) to authenticated;
revoke all on function public.admin_set_patient_bed_inventory_status(uuid,text,uuid) from public,anon;
grant execute on function public.admin_set_patient_bed_inventory_status(uuid,text,uuid) to authenticated;
revoke all on function public.billing_patient_care_details(uuid) from public,anon;
grant execute on function public.billing_patient_care_details(uuid) to authenticated;
revoke all on function public.billing_save_patient_bill(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean) from public,anon;
grant execute on function public.billing_save_patient_bill(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
