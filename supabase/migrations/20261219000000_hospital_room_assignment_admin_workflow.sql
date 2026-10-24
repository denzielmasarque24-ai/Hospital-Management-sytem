begin;

-- Retain every room stay when an admission is transferred. The admission's
-- room_id remains the current placement; this table is the append-only trail.
create table if not exists public.hospital_room_assignment_history (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null references public.patient_admissions(id) on delete restrict,
  patient_id uuid not null references auth.users(id) on delete restrict,
  room_id uuid not null references public.hospital_rooms(id) on delete restrict,
  assigned_at timestamptz not null,
  released_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  check (released_at is null or released_at >= assigned_at)
);
create unique index if not exists hospital_room_assignment_history_one_current_idx
  on public.hospital_room_assignment_history(admission_id) where released_at is null;
create unique index if not exists patient_admissions_one_active_room_idx
  on public.patient_admissions(room_id)
  where room_id is not null and status = 'admitted' and discharged_at is null;
create unique index if not exists patient_admissions_one_active_patient_idx
  on public.patient_admissions(patient_id)
  where status = 'admitted' and discharged_at is null;
alter table public.hospital_room_assignment_history enable row level security;
revoke all on public.hospital_room_assignment_history from anon, authenticated;
grant select on public.hospital_room_assignment_history to authenticated;
drop policy if exists "Patients read own room assignment history" on public.hospital_room_assignment_history;
create policy "Patients read own room assignment history" on public.hospital_room_assignment_history
  for select to authenticated using (patient_id = (select auth.uid()));
drop policy if exists "Admissions staff read room assignment history" on public.hospital_room_assignment_history;
create policy "Admissions staff read room assignment history" on public.hospital_room_assignment_history
  for select to authenticated using (public.can_manage_patient_area('admissions'));

create or replace function public.admin_admission_patient_directory()
returns table(patient_id uuid,full_name text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  return query select p.id,coalesce(nullif(btrim(to_jsonb(p)->>'full_name'),''),nullif(btrim(concat_ws(' ',to_jsonb(p)->>'first_name',to_jsonb(p)->>'middle_name',to_jsonb(p)->>'last_name')),''),'Patient')
    from public.profiles p where upper(p.role::text)='PATIENT' order by 2,p.id;
end;
$$;

create or replace function public.admin_assign_hospital_bed(
  p_patient_id uuid, p_room_id uuid, p_doctor_id uuid, p_admitted_at timestamptz,
  p_reason text default '', p_notes text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_admission uuid; v_room public.hospital_rooms%rowtype;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  if p_patient_id is null or not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Select a registered patient account' using errcode='23503'; end if;
  if p_admitted_at is null then raise exception 'Admission date and time are required' using errcode='22023'; end if;
  if p_doctor_id is not null and not exists(select 1 from public.doctors d where d.id=p_doctor_id and coalesce((to_jsonb(d)->>'available')::boolean,true)) then raise exception 'Select a valid available doctor' using errcode='23503'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text,0));
  if exists(select 1 from public.patient_admissions a where a.patient_id=p_patient_id and a.status='admitted' and a.discharged_at is null) then raise exception 'Patient already has an active admission' using errcode='23505'; end if;
  select * into v_room from public.hospital_rooms where id=p_room_id for update;
  if not found or v_room.status is distinct from 'available' or coalesce(v_room.is_demo,false) then raise exception 'This bed is already occupied. Please select another available bed.' using errcode='23505'; end if;
  if exists(select 1 from public.patient_admissions a where a.room_id=p_room_id and a.status='admitted' and a.discharged_at is null) then raise exception 'This bed is already occupied. Please select another available bed.' using errcode='23505'; end if;
  insert into public.patient_admissions(patient_id,doctor_id,room_id,admitted_at,status,reason,notes,is_demo)
    values(p_patient_id,p_doctor_id,p_room_id,p_admitted_at,'admitted',coalesce(p_reason,''),coalesce(p_notes,''),false) returning id into v_admission;
  insert into public.hospital_room_assignment_history(admission_id,patient_id,room_id,assigned_at,assigned_by)
    values(v_admission,p_patient_id,p_room_id,p_admitted_at,auth.uid());
  update public.hospital_rooms set status='occupied' where id=p_room_id;
  return v_admission;
end;
$$;

create or replace function public.admin_transfer_hospital_bed(p_admission_id uuid,p_room_id uuid,p_transferred_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare v_admission public.patient_admissions%rowtype; v_room public.hospital_rooms%rowtype;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  select * into v_admission from public.patient_admissions where id=p_admission_id for update;
  if not found or v_admission.status<>'admitted' or v_admission.discharged_at is not null or coalesce(v_admission.is_demo,false) then raise exception 'Active admission not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_admission.patient_id::text,0));
  select * into v_room from public.hospital_rooms where id=p_room_id for update;
  if not found or v_room.status is distinct from 'available' or coalesce(v_room.is_demo,false) or exists(select 1 from public.patient_admissions a where a.room_id=p_room_id and a.status='admitted' and a.discharged_at is null) then raise exception 'This bed is already occupied. Please select another available bed.' using errcode='23505'; end if;
  if p_transferred_at<=v_admission.admitted_at then raise exception 'Transfer time must follow admission time' using errcode='22023'; end if;
  insert into public.hospital_room_assignment_history(admission_id,patient_id,room_id,assigned_at,assigned_by)
    select p_admission_id,v_admission.patient_id,v_admission.room_id,v_admission.admitted_at,auth.uid()
    where v_admission.room_id is not null and not exists(select 1 from public.hospital_room_assignment_history h where h.admission_id=p_admission_id and h.room_id=v_admission.room_id);
  update public.hospital_room_assignment_history set released_at=p_transferred_at where admission_id=p_admission_id and released_at is null;
  update public.hospital_rooms set status='available' where id=v_admission.room_id and not exists(select 1 from public.patient_admissions a where a.room_id=v_admission.room_id and a.id<>p_admission_id and a.status='admitted' and a.discharged_at is null);
  update public.patient_admissions set room_id=p_room_id where id=p_admission_id;
  insert into public.hospital_room_assignment_history(admission_id,patient_id,room_id,assigned_at,assigned_by)
    values(p_admission_id,v_admission.patient_id,p_room_id,p_transferred_at,auth.uid());
  update public.hospital_rooms set status='occupied' where id=p_room_id;
end;
$$;

create or replace function public.admin_discharge_hospital_admission(p_admission_id uuid,p_discharged_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare v_admission public.patient_admissions%rowtype;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  select * into v_admission from public.patient_admissions where id=p_admission_id for update;
  if not found or v_admission.status<>'admitted' or v_admission.discharged_at is not null or coalesce(v_admission.is_demo,false) then raise exception 'Active admission not found' using errcode='P0002'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_admission.patient_id::text,0));
  update public.hospital_room_assignment_history set released_at=p_discharged_at where admission_id=p_admission_id and released_at is null;
  update public.patient_admissions set status='discharged',discharged_at=p_discharged_at where id=p_admission_id;
  update public.hospital_rooms set status='available' where id=v_admission.room_id and not exists(select 1 from public.patient_admissions a where a.room_id=v_admission.room_id and a.id<>p_admission_id and a.status='admitted' and a.discharged_at is null);
end;
$$;

revoke all on function public.admin_assign_hospital_bed(uuid,uuid,uuid,timestamptz,text,text) from public,anon;
revoke all on function public.admin_transfer_hospital_bed(uuid,uuid,timestamptz) from public,anon;
revoke all on function public.admin_discharge_hospital_admission(uuid,timestamptz) from public,anon;
revoke all on function public.admin_admission_patient_directory() from public,anon;
grant execute on function public.admin_assign_hospital_bed(uuid,uuid,uuid,timestamptz,text,text) to authenticated;
grant execute on function public.admin_transfer_hospital_bed(uuid,uuid,timestamptz) to authenticated;
grant execute on function public.admin_discharge_hospital_admission(uuid,timestamptz) to authenticated;
grant execute on function public.admin_admission_patient_directory() to authenticated;
notify pgrst,'reload schema';
commit;
