begin;

-- Fine-grained grants for staff whose work requires clinical or billing access.
-- An administrator cannot grant themselves clinical author/release rights.
create table if not exists public.patient_staff_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in ('clinical_author','clinical_release','lab_author','lab_release','billing','admissions','care_management','inventory')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, permission)
);
alter table public.patient_staff_permissions enable row level security;
revoke all on public.patient_staff_permissions from anon, authenticated;

create or replace function public.has_patient_staff_permission(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.patient_staff_permissions p
    where p.user_id = (select auth.uid()) and p.permission = p_permission
  );
$$;
revoke all on function public.has_patient_staff_permission(text) from public, anon;
grant execute on function public.has_patient_staff_permission(text) to authenticated;

create or replace function public.can_manage_patient_area(p_area text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_area
    when 'care_management' then public.current_admin_role() in ('ADMIN','SUPER_ADMIN') or public.has_patient_staff_permission('care_management')
    when 'admissions' then public.current_admin_role() in ('ADMIN','SUPER_ADMIN') or public.has_patient_staff_permission('admissions')
    when 'billing' then public.current_admin_role() in ('ADMIN','SUPER_ADMIN') or public.has_patient_staff_permission('billing')
    when 'inventory' then public.current_admin_role() in ('ADMIN','SUPER_ADMIN','INVENTORY_MANAGER') or public.has_patient_staff_permission('inventory')
    when 'clinical_author' then public.has_patient_staff_permission('clinical_author')
    when 'clinical_release' then public.has_patient_staff_permission('clinical_release')
    when 'lab_author' then public.has_patient_staff_permission('lab_author')
    when 'lab_release' then public.has_patient_staff_permission('lab_release')
    else false end;
$$;
revoke all on function public.can_manage_patient_area(text) from public, anon;
grant execute on function public.can_manage_patient_area(text) to authenticated;

create or replace function public.admin_set_patient_staff_permission(p_user_id uuid,p_permission text,p_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if public.current_admin_role() <> 'SUPER_ADMIN' then raise exception 'Super administrator access required to manage sensitive staff permissions' using errcode='42501'; end if;
  if p_permission not in ('clinical_author','clinical_release','lab_author','lab_release','billing','admissions','care_management','inventory') then raise exception 'Invalid staff permission' using errcode='22023'; end if;
  select upper(role::text) into v_role from public.profiles where id=p_user_id;
  if v_role is null or v_role in ('PATIENT','ADMIN','SUPER_ADMIN') then raise exception 'Select an eligible staff account with a non-patient clinical or billing role' using errcode='22023'; end if;
  if p_permission in ('clinical_author','clinical_release') and v_role not in ('DOCTOR','PHYSICIAN','CLINICIAN','CLINICAL_STAFF','NURSE') then raise exception 'Clinical permissions require a verified clinical account role' using errcode='42501'; end if;
  if p_permission in ('lab_author','lab_release') and v_role not in ('LAB_TECH','LAB_TECHNICIAN','LABORATORY_TECHNICIAN','PATHOLOGIST','LAB_SUPERVISOR') then raise exception 'Laboratory permissions require a verified laboratory account role' using errcode='42501'; end if;
  if p_permission='billing' and v_role not in ('BILLING_STAFF','BILLING_MANAGER','ACCOUNTANT','FINANCE_STAFF') then raise exception 'Billing permission requires a verified billing account role' using errcode='42501'; end if;
  if p_permission='inventory' and v_role<>'INVENTORY_MANAGER' then raise exception 'Inventory permission requires the Inventory Manager account role' using errcode='42501'; end if;
  if p_permission='admissions' and v_role not in ('ADMISSIONS_STAFF','DOCTOR','PHYSICIAN','CLINICIAN','NURSE') then raise exception 'Admissions permission requires a verified care account role' using errcode='42501'; end if;
  if p_permission='care_management' and v_role not in ('CARE_COORDINATOR','DOCTOR','PHYSICIAN','CLINICIAN','NURSE') then raise exception 'Care management permission requires a verified care account role' using errcode='42501'; end if;
  if p_granted then
    insert into public.patient_staff_permissions(user_id,permission,granted_by) values(p_user_id,p_permission,auth.uid()) on conflict(user_id,permission) do update set granted_by=excluded.granted_by;
  else
    delete from public.patient_staff_permissions where user_id=p_user_id and permission=p_permission;
  end if;
end;
$$;
revoke all on function public.admin_set_patient_staff_permission(uuid,text,boolean) from public,anon;
grant execute on function public.admin_set_patient_staff_permission(uuid,text,boolean) to authenticated;

-- Physical room and bed inventory. A partial unique index is the final guard
-- against assigning one bed to two active patients.
create table if not exists public.patient_rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique,
  category text not null default '',
  floor_or_ward text not null default '',
  status text not null default 'available' check (status in ('available','occupied','cleaning','maintenance')),
  created_at timestamptz not null default now()
);
create table if not exists public.patient_beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.patient_rooms(id) on delete restrict,
  bed_number text not null,
  status text not null default 'available' check (status in ('available','occupied','cleaning','maintenance')),
  created_at timestamptz not null default now(),
  unique (room_id, bed_number)
);
alter table public.patient_rooms enable row level security;
alter table public.patient_beds enable row level security;
revoke all on public.patient_rooms, public.patient_beds from anon, authenticated;
grant select on public.patient_rooms, public.patient_beds to authenticated;
drop policy if exists "Authorized staff view room inventory" on public.patient_rooms;
create policy "Authorized staff view room inventory" on public.patient_rooms for select to authenticated
  using (public.can_manage_patient_area('admissions'));
drop policy if exists "Authorized staff view bed inventory" on public.patient_beds;
create policy "Authorized staff view bed inventory" on public.patient_beds for select to authenticated
  using (public.can_manage_patient_area('admissions'));
alter table public.patient_room_assignments add column if not exists bed_id uuid references public.patient_beds(id) on delete restrict;
create unique index if not exists patient_room_assignments_one_active_bed_idx
  on public.patient_room_assignments(bed_id) where status = 'assigned' and bed_id is not null;
alter table public.patient_admissions drop constraint if exists patient_admissions_status_check;
alter table public.patient_admissions add constraint patient_admissions_status_check
  check (status in ('pending','admitted','discharged','cancelled'));
alter table public.patient_admissions add column if not exists admission_type text not null default 'inpatient';
alter table public.patient_admissions drop constraint if exists patient_admissions_admission_type_check;
alter table public.patient_admissions add constraint patient_admissions_admission_type_check check (admission_type in ('inpatient','emergency','observation','transfer'));
alter table public.patient_room_assignments add column if not exists released_reason text;

create or replace function public.admin_create_patient_room(p_room_number text,p_category text,p_floor_or_ward text,p_beds integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_room uuid; v_index integer;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  if btrim(coalesce(p_room_number,''))='' or p_beds < 1 or p_beds > 32 then raise exception 'Enter a room number and 1 to 32 beds' using errcode='22023'; end if;
  insert into public.patient_rooms(room_number,category,floor_or_ward) values(btrim(p_room_number),coalesce(p_category,''),coalesce(p_floor_or_ward,'')) returning id into v_room;
  for v_index in 1..p_beds loop
    insert into public.patient_beds(room_id,bed_number) values(v_room,v_index::text);
  end loop;
  return v_room;
end;
$$;

create or replace function public.admin_set_patient_bed_status(p_bed_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_room uuid;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  if p_status not in ('available','cleaning','maintenance') then raise exception 'Choose Available, Cleaning, or Maintenance' using errcode='22023'; end if;
  update public.patient_beds set status=p_status where id=p_bed_id and status <> 'occupied' returning room_id into v_room;
  if not found then raise exception 'Bed not found or currently occupied' using errcode='P0002'; end if;
  update public.patient_rooms r set status=case when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='occupied') then 'occupied' when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='available') then 'available' when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='cleaning') then 'cleaning' else 'maintenance' end where r.id=v_room;
end;
$$;

-- Encounters and test orders retain unreleased work privately. Patients only
-- receive SELECT access to rows explicitly released by clinical staff.
create table if not exists public.patient_medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  admission_id uuid,
  record_type text not null check (record_type in ('check_up','consultation','diagnostic')),
  occurred_at timestamptz not null default now(),
  doctor_id uuid references public.doctors(id) on delete set null,
  department text not null default '',
  reason text not null default '',
  assessment text not null default '',
  care_notes text not null default '',
  follow_up text not null default '',
  status text not null default 'draft' check (status in ('draft','released','amended')),
  released_at timestamptz,
  authored_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (admission_id, patient_id) references public.patient_admissions(id, patient_id)
);
create index if not exists patient_medical_records_patient_idx on public.patient_medical_records(patient_id, occurred_at desc);
create table if not exists public.patient_lab_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  admission_id uuid,
  medical_record_id uuid references public.patient_medical_records(id) on delete set null,
  test_type text not null check (test_type in ('laboratory','diagnostic')),
  test_name text not null,
  ordered_at timestamptz not null default now(),
  status text not null default 'ordered' check (status in ('ordered','in_progress','verified','released','cancelled')),
  result_summary text not null default '',
  result_details text not null default '',
  attachment_path text,
  released_at timestamptz,
  ordered_by uuid not null default auth.uid() references auth.users(id),
  verified_by uuid references auth.users(id),
  foreign key (admission_id, patient_id) references public.patient_admissions(id, patient_id)
);
create index if not exists patient_lab_orders_patient_idx on public.patient_lab_orders(patient_id, ordered_at desc);
alter table public.patient_medical_records enable row level security;
alter table public.patient_lab_orders enable row level security;
revoke all on public.patient_medical_records, public.patient_lab_orders from anon, authenticated;
grant select on public.patient_medical_records, public.patient_lab_orders to authenticated;
drop policy if exists "Patients read released own clinical records" on public.patient_medical_records;
create policy "Patients read released own clinical records" on public.patient_medical_records for select to authenticated
  using (patient_id = (select auth.uid()) and status = 'released' and released_at is not null);
drop policy if exists "Clinical staff read clinical records" on public.patient_medical_records;
create policy "Clinical staff read clinical records" on public.patient_medical_records for select to authenticated
  using (public.can_manage_patient_area('clinical_author') or public.can_manage_patient_area('clinical_release'));
drop policy if exists "Patients read released own test results" on public.patient_lab_orders;
create policy "Patients read released own test results" on public.patient_lab_orders for select to authenticated
  using (patient_id = (select auth.uid()) and status = 'released' and released_at is not null);
drop policy if exists "Lab staff read test orders" on public.patient_lab_orders;
create policy "Lab staff read test orders" on public.patient_lab_orders for select to authenticated
  using (public.can_manage_patient_area('lab_author') or public.can_manage_patient_area('lab_release'));

create table if not exists public.patient_bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.patient_bills(id) on delete cascade,
  description text not null,
  category text not null check (category in ('room','consultation','laboratory','diagnostic','medicine','medical_supply','other')),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  supply_charge_id uuid unique references public.patient_medical_charges(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists patient_bill_items_bill_idx on public.patient_bill_items(bill_id, created_at);
alter table public.patient_bills add column if not exists approved_discount numeric(12,2) not null default 0 check (approved_discount >= 0);
alter table public.patient_bills add column if not exists taxes_and_fees numeric(12,2) not null default 0 check (taxes_and_fees >= 0);
alter table public.patient_payments add column if not exists external_reference uuid;
alter table public.patient_payments add column if not exists receipt_number text;
alter table public.patient_medical_charges add column if not exists recorded_by uuid references auth.users(id) on delete set null;
alter table public.patient_bills add column if not exists external_reference uuid;
alter table public.patient_medical_charges add column if not exists external_reference uuid;
alter table public.patient_medical_charges add column if not exists inventory_product_id uuid references public.products(id) on delete set null;
create unique index if not exists patient_payments_external_reference_idx on public.patient_payments(external_reference) where external_reference is not null;
create unique index if not exists patient_payments_receipt_number_idx on public.patient_payments(receipt_number) where receipt_number is not null;
create unique index if not exists patient_bills_external_reference_idx on public.patient_bills(external_reference) where external_reference is not null;
create unique index if not exists patient_medical_charges_external_reference_idx on public.patient_medical_charges(external_reference) where external_reference is not null;
alter table public.patient_bill_items enable row level security;
revoke all on public.patient_bill_items from anon, authenticated;
grant select on public.patient_bill_items to authenticated;
drop policy if exists "Patients read own bill items" on public.patient_bill_items;
create policy "Patients read own bill items" on public.patient_bill_items for select to authenticated
  using (exists (select 1 from public.patient_bills b where b.id = bill_id and b.patient_id = (select auth.uid())));
drop policy if exists "Billing staff read bill items" on public.patient_bill_items;
create policy "Billing staff read bill items" on public.patient_bill_items for select to authenticated
  using (public.can_manage_patient_area('billing'));

drop policy if exists "Hospital staff can read patient profiles" on public.profiles;
create policy "Authorized care clinical and lab staff can read patient profiles" on public.profiles for select to authenticated
  using ((select public.is_hospital_staff())
    or public.can_manage_patient_area('care_management')
    or public.can_manage_patient_area('clinical_author')
    or public.can_manage_patient_area('clinical_release')
    or public.can_manage_patient_area('lab_author')
    or public.can_manage_patient_area('lab_release')
    or public.can_manage_patient_area('admissions')
    or public.can_manage_patient_area('billing')
    or public.can_manage_patient_area('inventory'));

create table if not exists public.patient_management_audit (
  id bigint generated always as identity primary key,
  patient_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  entity text not null,
  record_id uuid,
  action text not null,
  occurred_at timestamptz not null default now()
);
create index if not exists patient_management_audit_patient_idx on public.patient_management_audit(patient_id,occurred_at desc);
alter table public.patient_management_audit enable row level security;
revoke all on public.patient_management_audit from anon,authenticated;

create or replace function public.audit_patient_management_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_patient uuid; v_id uuid;
begin
  v_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_patient := nullif(v_row->>'patient_id','')::uuid;
  v_id := coalesce(nullif(v_row->>'id','')::uuid,nullif(v_row->>'user_id','')::uuid);
  insert into public.patient_management_audit(patient_id,actor_id,entity,record_id,action)
    values(v_patient,auth.uid(),tg_table_name,v_id,tg_op);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_patient_management_change() from public,anon,authenticated;
drop trigger if exists patient_audit_doctor_assignments on public.patient_doctor_assignments;
create trigger patient_audit_doctor_assignments after insert or update or delete on public.patient_doctor_assignments for each row execute function public.audit_patient_management_change();
drop trigger if exists patient_audit_admissions on public.patient_admissions;
create trigger patient_audit_admissions after insert or update or delete on public.patient_admissions for each row execute function public.audit_patient_management_change();
drop trigger if exists patient_audit_room_assignments on public.patient_room_assignments;
create trigger patient_audit_room_assignments after insert or update or delete on public.patient_room_assignments for each row execute function public.audit_patient_management_change();
drop trigger if exists patient_audit_medical_records on public.patient_medical_records;
create trigger patient_audit_medical_records after insert or update or delete on public.patient_medical_records for each row execute function public.audit_patient_management_change();
drop trigger if exists patient_audit_lab_orders on public.patient_lab_orders;
create trigger patient_audit_lab_orders after insert or update or delete on public.patient_lab_orders for each row execute function public.audit_patient_management_change();
drop trigger if exists patient_audit_bills on public.patient_bills;
create trigger patient_audit_bills after insert or update or delete on public.patient_bills for each row execute function public.audit_patient_management_change();
drop trigger if exists patient_audit_payments on public.patient_payments;
create trigger patient_audit_payments after insert or update or delete on public.patient_payments for each row execute function public.audit_patient_management_change();
drop trigger if exists patient_audit_medical_charges on public.patient_medical_charges;
create trigger patient_audit_medical_charges after insert or update or delete on public.patient_medical_charges for each row execute function public.audit_patient_management_change();
drop trigger if exists patient_audit_staff_permissions on public.patient_staff_permissions;
create trigger patient_audit_staff_permissions after insert or update or delete on public.patient_staff_permissions for each row execute function public.audit_patient_management_change();
grant select on public.patient_management_audit to authenticated;
drop policy if exists "Super administrators read patient management audit" on public.patient_management_audit;
create policy "Super administrators read patient management audit" on public.patient_management_audit for select to authenticated
  using ((select public.current_admin_role())='SUPER_ADMIN');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('patient-lab-reports','patient-lab-reports',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Patient and lab staff read authorized reports" on storage.objects;
create policy "Patient and lab staff read authorized reports" on storage.objects for select to authenticated
  using (bucket_id='patient-lab-reports' and exists(
    select 1 from public.patient_lab_orders o
    where o.id::text=(storage.foldername(name))[1]
      and ((o.patient_id=(select auth.uid()) and o.status='released' and o.released_at is not null)
        or public.can_manage_patient_area('lab_author') or public.can_manage_patient_area('lab_release'))
  ));
drop policy if exists "Lab authors upload patient reports" on storage.objects;
create policy "Lab authors upload patient reports" on storage.objects for insert to authenticated
  with check (bucket_id='patient-lab-reports' and public.can_manage_patient_area('lab_author') and exists(
    select 1 from public.patient_lab_orders o where o.id::text=(storage.foldername(name))[1] and o.status<>'released'
  ));
drop policy if exists "Lab authors update patient reports" on storage.objects;
create policy "Lab authors update patient reports" on storage.objects for update to authenticated
  using (bucket_id='patient-lab-reports' and public.can_manage_patient_area('lab_author') and exists(
    select 1 from public.patient_lab_orders o where o.id::text=(storage.foldername(name))[1] and o.status<>'released'
  ))
  with check (bucket_id='patient-lab-reports' and public.can_manage_patient_area('lab_author') and exists(
    select 1 from public.patient_lab_orders o where o.id::text=(storage.foldername(name))[1] and o.status<>'released'
  ));
drop policy if exists "Lab authors delete patient reports" on storage.objects;
create policy "Lab authors delete patient reports" on storage.objects for delete to authenticated
  using (bucket_id='patient-lab-reports' and public.can_manage_patient_area('lab_author') and exists(
    select 1 from public.patient_lab_orders o where o.id::text=(storage.foldername(name))[1] and o.status<>'released'
  ));

-- Make patient records immutable from browser table writes. All writes below
-- are atomic SECURITY DEFINER RPCs with role checks and explicit field lists.
revoke insert, update, delete on public.patient_doctor_assignments, public.patient_admissions,
  public.patient_room_assignments, public.patient_bills, public.patient_payments,
  public.patient_medical_charges from authenticated;

create or replace function public.admin_assign_patient_doctor(p_patient_id uuid, p_doctor_id uuid, p_department text default '', p_consultation_type text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.can_manage_patient_area('care_management') then raise exception 'Care management permission required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text,0));
  if not exists (select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  if p_doctor_id is not null and not exists (select 1 from public.doctors d where d.id=p_doctor_id and d.status='active') then raise exception 'Select an active doctor' using errcode='23503'; end if;
  update public.patient_doctor_assignments set active=false where patient_id=p_patient_id and active;
  if p_doctor_id is null then return null; end if;
  insert into public.patient_doctor_assignments(patient_id,doctor_id,department,consultation_type,active)
  values(p_patient_id,p_doctor_id,coalesce(p_department,''),coalesce(p_consultation_type,''),true) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.admin_admit_patient(p_patient_id uuid,p_reason text,p_department text,p_admission_date date default current_date,p_doctor_id uuid default null,p_bed_id uuid default null,p_admission_type text default 'inpatient',p_status text default 'admitted')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_admission uuid; v_number text; v_room record;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text,0));
  if p_status not in ('pending','admitted') then raise exception 'New admissions may be Pending or Admitted' using errcode='22023'; end if;
  if p_status='pending' and p_bed_id is not null then raise exception 'A pending admission cannot occupy a bed' using errcode='22023'; end if;
  if p_admission_type not in ('inpatient','emergency','observation','transfer') then raise exception 'Invalid admission type' using errcode='22023'; end if;
  if not exists (select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  if exists (select 1 from public.patient_admissions a where a.patient_id=p_patient_id and a.status='admitted') then raise exception 'Patient already has an active admission' using errcode='23505'; end if;
  if p_doctor_id is not null and not exists (select 1 from public.doctors d where d.id=p_doctor_id and d.status='active') then raise exception 'Select an active doctor' using errcode='23503'; end if;
  v_number := 'MW-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
  insert into public.patient_admissions(patient_id,admission_number,status,admission_date,doctor_id,department,reason,admission_type)
  values(p_patient_id,v_number,p_status,coalesce(p_admission_date,current_date),p_doctor_id,coalesce(p_department,''),coalesce(p_reason,''),p_admission_type) returning id into v_admission;
  if p_bed_id is not null then
    select b.id,b.bed_number,b.status,r.id room_id,r.room_number,r.category,r.floor_or_ward
    into v_room from public.patient_beds b join public.patient_rooms r on r.id=b.room_id
    where b.id=p_bed_id for update of b;
    if not found or v_room.status <> 'available' or v_room.room_id is null then raise exception 'Selected bed is not available' using errcode='23505'; end if;
    update public.patient_beds set status='occupied' where id=p_bed_id;
    update public.patient_rooms set status='occupied' where id=v_room.room_id;
    insert into public.patient_room_assignments(admission_id,patient_id,bed_id,room_number,bed_number,room_type,floor_or_ward,status)
      values(v_admission,p_patient_id,p_bed_id,v_room.room_number,v_room.bed_number,v_room.category,v_room.floor_or_ward,'assigned');
  end if;
  return v_admission;
end;
$$;

create or replace function public.admin_activate_patient_admission(p_admission_id uuid,p_bed_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_patient uuid; v_room record;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  select patient_id into v_patient from public.patient_admissions where id=p_admission_id and status='pending' for update;
  if not found then raise exception 'Pending admission not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_patient::text,0));
  if exists(select 1 from public.patient_admissions where patient_id=v_patient and status='admitted') then raise exception 'Patient already has an active admission' using errcode='23505'; end if;
  if p_bed_id is not null then
    select b.id,b.bed_number,b.status,r.id room_id,r.room_number,r.category,r.floor_or_ward into v_room
      from public.patient_beds b join public.patient_rooms r on r.id=b.room_id where b.id=p_bed_id for update of b;
    if not found or v_room.status<>'available' then raise exception 'Selected bed is not available' using errcode='23505'; end if;
    update public.patient_beds set status='occupied' where id=p_bed_id;
    update public.patient_rooms set status='occupied' where id=v_room.room_id;
    insert into public.patient_room_assignments(admission_id,patient_id,bed_id,room_number,bed_number,room_type,floor_or_ward,status)
      values(p_admission_id,v_patient,p_bed_id,v_room.room_number,v_room.bed_number,v_room.category,v_room.floor_or_ward,'assigned');
  end if;
  update public.patient_admissions set status='admitted' where id=p_admission_id;
end;
$$;

create or replace function public.admin_cancel_pending_admission(p_admission_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  update public.patient_admissions set status='cancelled' where id=p_admission_id and status='pending';
  if not found then raise exception 'Pending admission not found' using errcode='P0002'; end if;
end;
$$;

create or replace function public.admin_transfer_patient_bed(p_admission_id uuid,p_bed_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_patient uuid; v_old uuid; v_old_room uuid; v_room record;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  select patient_id into v_patient from public.patient_admissions where id=p_admission_id and status='admitted' for update;
  if not found then raise exception 'Active admission not found' using errcode='P0002'; end if;
  select bed_id into v_old from public.patient_room_assignments where admission_id=p_admission_id and status='assigned' order by assigned_at desc limit 1 for update;
  select b.id,b.bed_number,b.status,r.id room_id,r.room_number,r.category,r.floor_or_ward into v_room
    from public.patient_beds b join public.patient_rooms r on r.id=b.room_id where b.id=p_bed_id for update of b;
  if not found or v_room.status <> 'available' then raise exception 'Selected bed is not available' using errcode='23505'; end if;
  if v_old is not null then
    update public.patient_room_assignments set status='released',released_at=now(),released_reason='transfer' where admission_id=p_admission_id and status='assigned';
    select room_id into v_old_room from public.patient_beds where id=v_old;
    update public.patient_beds set status='cleaning' where id=v_old;
    update public.patient_rooms r set status=case when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='occupied') then 'occupied' when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='available') then 'available' when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='cleaning') then 'cleaning' else 'maintenance' end where r.id=v_old_room;
  end if;
  update public.patient_beds set status='occupied' where id=p_bed_id;
  update public.patient_rooms set status='occupied' where id=v_room.room_id;
  insert into public.patient_room_assignments(admission_id,patient_id,bed_id,room_number,bed_number,room_type,floor_or_ward,status)
    values(p_admission_id,v_patient,p_bed_id,v_room.room_number,v_room.bed_number,v_room.category,v_room.floor_or_ward,'assigned');
end;
$$;

create or replace function public.admin_discharge_patient(p_admission_id uuid,p_discharge_date date default current_date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_bed uuid; v_room uuid;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  update public.patient_admissions set status='discharged',discharge_date=coalesce(p_discharge_date,current_date)
    where id=p_admission_id and status='admitted';
  if not found then raise exception 'Active admission not found' using errcode='P0002'; end if;
  select bed_id into v_bed from public.patient_room_assignments where admission_id=p_admission_id and status='assigned' order by assigned_at desc limit 1 for update;
  update public.patient_room_assignments set status='released',released_at=now(),released_reason='discharge'
    where admission_id=p_admission_id and status='assigned';
  if v_bed is not null then
    select room_id into v_room from public.patient_beds where id=v_bed;
    update public.patient_beds set status='cleaning' where id=v_bed;
    update public.patient_rooms r set status=case when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='occupied') then 'occupied' when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='available') then 'available' when exists(select 1 from public.patient_beds b where b.room_id=r.id and b.status='cleaning') then 'cleaning' else 'maintenance' end where r.id=v_room;
  end if;
end;
$$;

create or replace function public.clinical_create_patient_record(p_patient_id uuid,p_record_type text,p_occurred_at timestamptz,p_doctor_id uuid,p_department text,p_reason text,p_assessment text,p_care_notes text,p_follow_up text,p_admission_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.can_manage_patient_area('clinical_author') then raise exception 'Clinical author permission required' using errcode='42501'; end if;
  if p_record_type not in ('check_up','consultation','diagnostic') then raise exception 'Invalid clinical record type' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  insert into public.patient_medical_records(patient_id,admission_id,record_type,occurred_at,doctor_id,department,reason,assessment,care_notes,follow_up,authored_by)
  values(p_patient_id,p_admission_id,p_record_type,coalesce(p_occurred_at,now()),p_doctor_id,coalesce(p_department,''),coalesce(p_reason,''),coalesce(p_assessment,''),coalesce(p_care_notes,''),coalesce(p_follow_up,''),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.clinical_release_patient_record(p_record_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_patient_area('clinical_release') then raise exception 'Clinical release permission required' using errcode='42501'; end if;
  update public.patient_medical_records set status='released',released_at=now() where id=p_record_id and status='draft';
  if not found then raise exception 'Draft clinical record not found' using errcode='P0002'; end if;
end;
$$;

create or replace function public.clinical_update_patient_record(p_record_id uuid,p_record_type text,p_occurred_at timestamptz,p_doctor_id uuid,p_department text,p_reason text,p_assessment text,p_care_notes text,p_follow_up text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_patient_area('clinical_author') then raise exception 'Clinical author permission required' using errcode='42501'; end if;
  if p_record_type not in ('check_up','consultation','diagnostic') then raise exception 'Invalid clinical record type' using errcode='22023'; end if;
  update public.patient_medical_records set record_type=p_record_type,occurred_at=coalesce(p_occurred_at,now()),doctor_id=p_doctor_id,department=coalesce(p_department,''),reason=coalesce(p_reason,''),assessment=coalesce(p_assessment,''),care_notes=coalesce(p_care_notes,''),follow_up=coalesce(p_follow_up,'')
    where id=p_record_id and authored_by=auth.uid() and status='draft';
  if not found then raise exception 'Only your own draft clinical records can be edited' using errcode='42501'; end if;
end;
$$;

create or replace function public.lab_create_patient_order(p_patient_id uuid,p_test_type text,p_test_name text,p_admission_id uuid default null,p_medical_record_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.can_manage_patient_area('lab_author') then raise exception 'Laboratory author permission required' using errcode='42501'; end if;
  if p_test_type not in ('laboratory','diagnostic') or btrim(coalesce(p_test_name,''))='' then raise exception 'Test type and name are required' using errcode='22023'; end if;
  insert into public.patient_lab_orders(patient_id,admission_id,medical_record_id,test_type,test_name,ordered_by)
  values(p_patient_id,p_admission_id,p_medical_record_id,p_test_type,btrim(p_test_name),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.lab_update_patient_order(p_order_id uuid,p_status text,p_result_summary text,p_result_details text,p_attachment_path text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_patient_area('lab_author') then raise exception 'Laboratory author permission required' using errcode='42501'; end if;
  if p_status not in ('in_progress','verified') then raise exception 'Only in-progress or verified states can be saved by a laboratory author' using errcode='22023'; end if;
  if p_attachment_path is not null and (split_part(p_attachment_path,'/',1)<>p_order_id::text or not exists(select 1 from storage.objects o where o.bucket_id='patient-lab-reports' and o.name=p_attachment_path)) then raise exception 'Report attachment was not uploaded to this test order' using errcode='22023'; end if;
  update public.patient_lab_orders set status=p_status,result_summary=coalesce(p_result_summary,''),result_details=coalesce(p_result_details,''),attachment_path=p_attachment_path,verified_by=case when p_status='verified' then auth.uid() else verified_by end where id=p_order_id and status in ('ordered','in_progress','verified');
  if not found then raise exception 'Test order not found' using errcode='P0002'; end if;
end;
$$;

create or replace function public.lab_release_patient_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_patient_area('lab_release') then raise exception 'Laboratory release permission required' using errcode='42501'; end if;
  update public.patient_lab_orders set status='released',released_at=now() where id=p_order_id and status='verified' and verified_by is not null;
  if not found then raise exception 'Only verified results can be released' using errcode='P0002'; end if;
end;
$$;

create or replace function public.billing_create_patient_bill(p_patient_id uuid,p_admission_id uuid,p_description text,p_discount numeric,p_taxes numeric,p_items jsonb,p_external_reference uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_bill uuid; v_number text; v_subtotal numeric(14,2); v_existing_patient uuid;
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  if p_external_reference is null then raise exception 'A bill idempotency reference is required' using errcode='22023'; end if;
  select id,patient_id into v_bill,v_existing_patient from public.patient_bills where external_reference=p_external_reference;
  if v_bill is not null then
    if v_existing_patient<>p_patient_id then raise exception 'Bill reference was already used for another patient' using errcode='23505'; end if;
    return v_bill;
  end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'At least one bill item is required' using errcode='22023'; end if;
  if coalesce(p_discount,0)<0 or coalesce(p_taxes,0)<0 then raise exception 'Discounts and fees cannot be negative' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  if p_admission_id is not null and not exists(select 1 from public.patient_admissions a where a.id=p_admission_id and a.patient_id=p_patient_id) then raise exception 'Admission does not belong to this patient' using errcode='23503'; end if;
  v_number := 'B-' || to_char(clock_timestamp(),'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,5));
  insert into public.patient_bills(patient_id,admission_id,bill_number,description,total_amount,approved_discount,taxes_and_fees,external_reference)
  values(p_patient_id,p_admission_id,v_number,coalesce(p_description,''),0,coalesce(p_discount,0),coalesce(p_taxes,0),p_external_reference) returning id into v_bill;
  insert into public.patient_bill_items(bill_id,description,category,quantity,unit_price)
  select v_bill,x.description,x.category,x.quantity,x.unit_price
  from jsonb_to_recordset(p_items) as x(description text,category text,quantity numeric,unit_price numeric)
  where btrim(coalesce(x.description,''))<>'' and x.quantity>0 and x.unit_price>=0;
  if not found then raise exception 'No valid bill items were supplied' using errcode='22023'; end if;
  select coalesce(sum(line_total),0) into v_subtotal from public.patient_bill_items where bill_id=v_bill;
  if coalesce(p_discount,0)>v_subtotal then raise exception 'Discount cannot exceed the subtotal' using errcode='22023'; end if;
  update public.patient_bills set total_amount=round(v_subtotal-coalesce(p_discount,0)+coalesce(p_taxes,0),2) where id=v_bill;
  return v_bill;
end;
$$;

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

create or replace function public.billing_add_existing_supply_charge(p_bill_id uuid,p_charge_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_bill public.patient_bills%rowtype; v_charge public.patient_medical_charges%rowtype; v_subtotal numeric(14,2);
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  select * into v_bill from public.patient_bills where id=p_bill_id for update;
  if not found then raise exception 'Bill not found' using errcode='P0002'; end if;
  select * into v_charge from public.patient_medical_charges where id=p_charge_id for update;
  if not found or v_charge.category<>'medical_supply' or v_charge.patient_id<>v_bill.patient_id then raise exception 'Supply charge does not belong to this patient' using errcode='23503'; end if;
  if v_charge.bill_id is not null or exists(select 1 from public.patient_bill_items i where i.supply_charge_id=p_charge_id) then raise exception 'This supply charge has already been added to a bill' using errcode='23505'; end if;
  insert into public.patient_bill_items(bill_id,description,category,quantity,unit_price,supply_charge_id)
    values(p_bill_id,v_charge.item_name,'medical_supply',v_charge.quantity,v_charge.unit_price,p_charge_id);
  update public.patient_medical_charges set bill_id=p_bill_id where id=p_charge_id;
  select coalesce(sum(line_total),0) into v_subtotal from public.patient_bill_items where bill_id=p_bill_id;
  if v_bill.approved_discount>v_subtotal then raise exception 'Existing discount exceeds the bill subtotal after adding this item' using errcode='22023'; end if;
  update public.patient_bills set total_amount=round(v_subtotal-approved_discount+taxes_and_fees,2) where id=p_bill_id;
end;
$$;

create or replace function public.inventory_record_patient_supply(p_patient_id uuid,p_admission_id uuid,p_product_id uuid,p_quantity numeric,p_bill_id uuid default null,p_external_reference uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_product public.products%rowtype; v_charge uuid; v_total numeric(14,2); v_existing public.patient_medical_charges%rowtype;
begin
  if not public.can_manage_patient_area('inventory') then raise exception 'Inventory permission required' using errcode='42501'; end if;
  if p_external_reference is null then raise exception 'A supply-use idempotency reference is required' using errcode='22023'; end if;
  select * into v_existing from public.patient_medical_charges where external_reference=p_external_reference;
  if found then
    if v_existing.patient_id<>p_patient_id or v_existing.inventory_product_id<>p_product_id or v_existing.quantity<>p_quantity then raise exception 'Supply-use reference was reused with different details' using errcode='23505'; end if;
    return v_existing.id;
  end if;
  if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) then raise exception 'Supply quantity must be a positive whole number' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  if p_admission_id is not null and not exists(select 1 from public.patient_admissions a where a.id=p_admission_id and a.patient_id=p_patient_id) then raise exception 'Admission does not belong to this patient' using errcode='23503'; end if;
  select * into v_product from public.products where id=p_product_id and available is true for update;
  if not found then raise exception 'Active inventory item not found' using errcode='P0002'; end if;
  if v_product.stock < p_quantity then raise exception 'Insufficient inventory stock' using errcode='22023'; end if;
  if p_bill_id is not null and not exists(select 1 from public.patient_bills b where b.id=p_bill_id and b.patient_id=p_patient_id) then raise exception 'Bill does not belong to this patient' using errcode='23503'; end if;
  insert into public.patient_medical_charges(patient_id,admission_id,bill_id,item_name,category,quantity,unit_price,recorded_by,inventory_product_id,external_reference)
  values(p_patient_id,p_admission_id,p_bill_id,v_product.name,'medical_supply',p_quantity,v_product.price,auth.uid(),p_product_id,p_external_reference) returning id into v_charge;
  update public.products set stock=stock-p_quantity,updated_at=now() where id=p_product_id;
  insert into public.inventory_adjustments(product_id,quantity,note,adjusted_by)
  values(p_product_id,-p_quantity,'Patient supply use: '||p_patient_id::text,auth.uid());
  if p_bill_id is not null then
    insert into public.patient_bill_items(bill_id,description,category,quantity,unit_price,supply_charge_id)
    values(p_bill_id,v_product.name,'medical_supply',p_quantity,v_product.price,v_charge);
    select coalesce(sum(line_total),0) into v_total from public.patient_bill_items where bill_id=p_bill_id;
    update public.patient_bills set total_amount=round(v_total-approved_discount+taxes_and_fees,2) where id=p_bill_id;
  end if;
  return v_charge;
end;
$$;

create or replace function public.admin_patient_management_directory(p_search text default '',p_limit integer default 20,p_offset integer default 0)
returns table (
  patient_id uuid, full_name text, email text, phone text, registered_at timestamptz,
  assigned_doctor text, admission_status text, room_number text, bed_number text,
  outstanding_balance numeric, total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_admin_role() not in ('ADMIN','SUPER_ADMIN')
    and not public.can_manage_patient_area('care_management')
    and not public.can_manage_patient_area('admissions')
    and not public.can_manage_patient_area('billing')
    and not public.can_manage_patient_area('inventory')
    and not public.can_manage_patient_area('clinical_author')
    and not public.can_manage_patient_area('clinical_release')
    and not public.can_manage_patient_area('lab_author')
    and not public.can_manage_patient_area('lab_release') then
    raise exception 'Authorized patient management staff required' using errcode='42501';
  end if;
  return query
  select u.id,
    coalesce(nullif(btrim(concat_ws(' ',nullif(p.first_name,''),nullif(p.middle_name,''),nullif(p.last_name,''),nullif(p.suffix,''))),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),nullif(btrim(u.raw_user_meta_data->>'name'),''),'Patient'),
    coalesce(u.email,''),coalesce(p.mobile_number,u.raw_user_meta_data->>'phone',''),u.created_at,
    doctor.display_name,admission.status,room.room_number,room.bed_number,
    coalesce(balance.amount,0)::numeric,
    count(*) over()
  from auth.users u
  join public.profiles p on p.id=u.id and upper(coalesce(p.role::text,''))='PATIENT'
  left join lateral (
    select concat_ws(' ',d.first_name,d.last_name) as display_name
    from public.patient_doctor_assignments a join public.doctors d on d.id=a.doctor_id
    where a.patient_id=u.id and a.active order by a.assigned_at desc limit 1
  ) doctor on true
  left join lateral (
    select a.status from public.patient_admissions a where a.patient_id=u.id and a.status in ('pending','admitted')
    order by case when a.status='admitted' then 0 else 1 end,a.admission_date desc limit 1
  ) admission on true
  left join lateral (
    select r.room_number,r.bed_number from public.patient_room_assignments r
    where r.patient_id=u.id and r.status='assigned' order by r.assigned_at desc limit 1
  ) room on true
  left join lateral (
    select coalesce(sum(greatest(b.total_amount - coalesce(pay.paid,0),0)),0)::numeric amount
    from public.patient_bills b
    left join lateral (select sum(x.amount) paid from public.patient_payments x where x.bill_id=b.id) pay on true
    where b.patient_id=u.id
  ) balance on true
  where coalesce(btrim(p_search),'')='' or u.id::text ilike '%'||btrim(p_search)||'%'
    or coalesce(u.email,'') ilike '%'||btrim(p_search)||'%'
    or coalesce(p.first_name||' '||p.middle_name||' '||p.last_name,'') ilike '%'||btrim(p_search)||'%'
    or coalesce(p.mobile_number,u.raw_user_meta_data->>'phone','') ilike '%'||btrim(p_search)||'%'
  order by u.created_at desc,u.id
  limit greatest(1,least(coalesce(p_limit,20),100)) offset greatest(coalesce(p_offset,0),0);
end;
$$;

create or replace function public.admin_patient_staff_directory()
returns table(user_id uuid,full_name text,email text,role text,permissions text[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_admin_role()<>'SUPER_ADMIN' then raise exception 'Super administrator access required' using errcode='42501'; end if;
  return query
  select u.id,
    coalesce(nullif(btrim(concat_ws(' ',nullif(p.first_name,''),nullif(p.middle_name,''),nullif(p.last_name,''),nullif(p.suffix,''))),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),nullif(btrim(u.raw_user_meta_data->>'name'),''),'Staff account'),
    coalesce(u.email,''),upper(p.role::text),coalesce(array_agg(sp.permission) filter(where sp.permission is not null),array[]::text[])
  from auth.users u join public.profiles p on p.id=u.id
  left join public.patient_staff_permissions sp on sp.user_id=u.id
  where upper(p.role::text) not in ('PATIENT','ADMIN','SUPER_ADMIN')
  group by u.id,p.first_name,p.middle_name,p.last_name,p.suffix,p.role,u.email,u.raw_user_meta_data
  order by p.role,u.email;
end;
$$;

-- Existing admin/patient tables: patients keep SELECT-only access and writers
-- go through checked transactional functions above.
drop policy if exists "Administrators manage doctor assignments" on public.patient_doctor_assignments;
create policy "Authorized staff read patient doctor assignments" on public.patient_doctor_assignments for select to authenticated
  using (patient_id=(select auth.uid()) or public.can_manage_patient_area('care_management'));
drop policy if exists "Administrators manage admissions" on public.patient_admissions;
create policy "Authorized staff read patient admissions" on public.patient_admissions for select to authenticated
  using (patient_id=(select auth.uid()) or public.can_manage_patient_area('admissions'));
drop policy if exists "Administrators manage room assignments" on public.patient_room_assignments;
create policy "Authorized staff read patient room assignments" on public.patient_room_assignments for select to authenticated
  using (patient_id=(select auth.uid()) or public.can_manage_patient_area('admissions'));
drop policy if exists "Administrators manage bills" on public.patient_bills;
create policy "Authorized staff read patient bills" on public.patient_bills for select to authenticated
  using (patient_id=(select auth.uid()) or public.can_manage_patient_area('billing'));
drop policy if exists "Administrators manage payments" on public.patient_payments;
create policy "Authorized staff read patient payments" on public.patient_payments for select to authenticated
  using (patient_id=(select auth.uid()) or public.can_manage_patient_area('billing'));
drop policy if exists "Administrators manage medical charges" on public.patient_medical_charges;
create policy "Authorized staff read patient medical charges" on public.patient_medical_charges for select to authenticated
  using (patient_id=(select auth.uid()) or public.can_manage_patient_area('billing') or public.can_manage_patient_area('inventory'));

revoke all on function public.admin_assign_patient_doctor(uuid,uuid,text,text) from public,anon;
revoke all on function public.admin_admit_patient(uuid,text,text,date,uuid,uuid,text,text) from public,anon;
revoke all on function public.admin_activate_patient_admission(uuid,uuid) from public,anon;
revoke all on function public.admin_cancel_pending_admission(uuid) from public,anon;
revoke all on function public.admin_transfer_patient_bed(uuid,uuid) from public,anon;
revoke all on function public.admin_discharge_patient(uuid,date) from public,anon;
revoke all on function public.admin_create_patient_room(text,text,text,integer) from public,anon;
revoke all on function public.admin_set_patient_bed_status(uuid,text) from public,anon;
revoke all on function public.clinical_create_patient_record(uuid,text,timestamptz,uuid,text,text,text,text,text,uuid) from public,anon;
revoke all on function public.clinical_release_patient_record(uuid) from public,anon;
revoke all on function public.clinical_update_patient_record(uuid,text,timestamptz,uuid,text,text,text,text,text) from public,anon;
revoke all on function public.lab_create_patient_order(uuid,text,text,uuid,uuid) from public,anon;
revoke all on function public.lab_update_patient_order(uuid,text,text,text,text) from public,anon;
revoke all on function public.lab_release_patient_order(uuid) from public,anon;
revoke all on function public.billing_create_patient_bill(uuid,uuid,text,numeric,numeric,jsonb,uuid) from public,anon;
revoke all on function public.billing_record_patient_payment(uuid,numeric,text,uuid) from public,anon;
revoke all on function public.billing_add_existing_supply_charge(uuid,uuid) from public,anon;
revoke all on function public.inventory_record_patient_supply(uuid,uuid,uuid,numeric,uuid,uuid) from public,anon;
revoke all on function public.admin_patient_management_directory(text,integer,integer) from public,anon;
revoke all on function public.admin_patient_staff_directory() from public,anon;
grant execute on function public.admin_assign_patient_doctor(uuid,uuid,text,text) to authenticated;
grant execute on function public.admin_admit_patient(uuid,text,text,date,uuid,uuid,text,text) to authenticated;
grant execute on function public.admin_activate_patient_admission(uuid,uuid) to authenticated;
grant execute on function public.admin_cancel_pending_admission(uuid) to authenticated;
grant execute on function public.admin_transfer_patient_bed(uuid,uuid) to authenticated;
grant execute on function public.admin_discharge_patient(uuid,date) to authenticated;
grant execute on function public.admin_create_patient_room(text,text,text,integer) to authenticated;
grant execute on function public.admin_set_patient_bed_status(uuid,text) to authenticated;
grant execute on function public.clinical_create_patient_record(uuid,text,timestamptz,uuid,text,text,text,text,text,uuid) to authenticated;
grant execute on function public.clinical_release_patient_record(uuid) to authenticated;
grant execute on function public.clinical_update_patient_record(uuid,text,timestamptz,uuid,text,text,text,text,text) to authenticated;
grant execute on function public.lab_create_patient_order(uuid,text,text,uuid,uuid) to authenticated;
grant execute on function public.lab_update_patient_order(uuid,text,text,text,text) to authenticated;
grant execute on function public.lab_release_patient_order(uuid) to authenticated;
grant execute on function public.billing_create_patient_bill(uuid,uuid,text,numeric,numeric,jsonb,uuid) to authenticated;
grant execute on function public.billing_record_patient_payment(uuid,numeric,text,uuid) to authenticated;
grant execute on function public.billing_add_existing_supply_charge(uuid,uuid) to authenticated;
grant execute on function public.inventory_record_patient_supply(uuid,uuid,uuid,numeric,uuid,uuid) to authenticated;
grant execute on function public.admin_patient_management_directory(text,integer,integer) to authenticated;
grant execute on function public.admin_patient_staff_directory() to authenticated;

notify pgrst, 'reload schema';
commit;
