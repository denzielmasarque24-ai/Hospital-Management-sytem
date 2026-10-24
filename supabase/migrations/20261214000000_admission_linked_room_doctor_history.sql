begin;

-- Admission links are the authoritative source for assigned room and doctor.
-- JSON projection intentionally avoids relying on optional legacy columns.
create or replace function public._patient_admission_care_history(p_patient_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    to_jsonb(a) || jsonb_build_object(
      'room_assigned_at',coalesce(to_jsonb(a)->>'room_assigned_at',to_jsonb(a)->>'room_assignment_date'),
      'room', case when r.id is null then null else
        jsonb_build_object('id',r.id,'room_number',to_jsonb(r)->>'room_number',
          'room_type',coalesce(to_jsonb(r)->>'room_type',to_jsonb(r)->>'category'),
          'bed_number',to_jsonb(r)->>'bed_number','is_demo',coalesce((to_jsonb(r)->>'is_demo')::boolean,false)) end,
      'doctor', case when d.id is null then null else
        jsonb_build_object('id',d.id,'display_name',to_jsonb(d)->>'display_name',
          'specialty',to_jsonb(d)->>'specialty','department',to_jsonb(d)->>'department',
          'sub_specialization',to_jsonb(d)->>'sub_specialization',
          'consultation_fee',to_jsonb(d)->>'consultation_fee','avatar_url',to_jsonb(d)->>'avatar_url',
          'image_url',to_jsonb(d)->>'image_url','available',to_jsonb(d)->>'available',
          'is_demo',coalesce((to_jsonb(d)->>'is_demo')::boolean,false)) end,
      'is_demo',coalesce((to_jsonb(a)->>'is_demo')::boolean,false)
    ) order by a.admission_date desc nulls last
  ),'[]'::jsonb)
  from public.patient_admissions a
  left join public.hospital_rooms r on r.id=a.room_id
  left join public.doctors d on d.id=a.doctor_id
  where a.patient_id=p_patient_id
$$;
revoke all on function public._patient_admission_care_history(uuid) from public,anon,authenticated;

create or replace function public.patient_my_care_history()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.profiles p where p.id=auth.uid() and upper(p.role::text)='PATIENT') then
    raise exception 'Patient authentication required' using errcode='42501';
  end if;
  return public._patient_admission_care_history(auth.uid());
end;
$$;
revoke all on function public.patient_my_care_history() from public,anon;
grant execute on function public.patient_my_care_history() to authenticated;

create or replace function public.billing_patient_care_details(p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_history jsonb; v_current jsonb;
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then
    raise exception 'Patient account not found' using errcode='P0002';
  end if;
  v_history:=public._patient_admission_care_history(p_patient_id);
  select item.value into v_current from jsonb_array_elements(v_history) as item(value)
    order by case when lower(coalesce(item.value->>'status',''))='admitted' and item.value->>'discharge_date' is null then 0 else 1 end,
      item.value->>'admission_date' desc nulls last limit 1;
  if v_current is null then v_current:='{}'::jsonb; end if;
  return v_current || jsonb_build_object('admissions',v_history,
    'admission_id',v_current->>'id','admission_number',v_current->>'admission_number',
    'admission_status',v_current->>'status','admission_date',v_current->>'admission_date',
    'discharge_date',v_current->>'discharge_date',
    'room_id',v_current#>>'{room,id}','room_number',v_current#>>'{room,room_number}',
    'room_type',v_current#>>'{room,room_type}','bed_number',v_current#>>'{room,bed_number}',
    'room_is_demo',coalesce((v_current#>>'{room,is_demo}')::boolean,false),
    'doctor_id',v_current#>>'{doctor,id}','doctor_name',v_current#>>'{doctor,display_name}',
    'specialty',v_current#>>'{doctor,specialty}','doctor_department',v_current#>>'{doctor,department}',
    'doctor_sub_specialization',v_current#>>'{doctor,sub_specialization}',
    'doctor_consultation_fee',v_current#>>'{doctor,consultation_fee}',
    'doctor_photo_url',coalesce(v_current#>>'{doctor,avatar_url}',v_current#>>'{doctor,image_url}'),
    'doctor_available',v_current#>>'{doctor,available}',
    'doctor_is_demo',coalesce((v_current#>>'{doctor,is_demo}')::boolean,false),
    'doctor_assignment_active',lower(coalesce(v_current->>'status',''))='admitted' and v_current->>'discharge_date' is null,
    'room_assignment_id',null,'daily_rate',null,'bed_status',case when v_current#>>'{room,id}' is null then null else 'Occupied' end);
end;
$$;
revoke all on function public.billing_patient_care_details(uuid) from public,anon;
grant execute on function public.billing_patient_care_details(uuid) to authenticated;

create or replace function public.billing_patient_consultations(p_patient_id uuid)
returns table(record_id uuid,doctor_id uuid,occurred_at timestamptz,record_type text,reason text,doctor_name text,specialty text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  return query select m.id,m.doctor_id,m.occurred_at,m.record_type,m.reason,
    coalesce(to_jsonb(d)->>'display_name',concat_ws(' ',to_jsonb(d)->>'first_name',to_jsonb(d)->>'last_name')),
    coalesce(to_jsonb(d)->>'specialty',to_jsonb(d)->>'specialization')
  from public.patient_medical_records m join public.doctors d on d.id=m.doctor_id
  where m.patient_id=p_patient_id and m.status in ('released','amended') and m.released_at is not null
    and coalesce((to_jsonb(m)->>'is_demo')::boolean,false)=false
    and coalesce((to_jsonb(d)->>'is_demo')::boolean,false)=false
    and not exists(select 1 from public.patient_admissions a where a.id=m.admission_id and coalesce((to_jsonb(a)->>'is_demo')::boolean,false));
end;
$$;
revoke all on function public.billing_patient_consultations(uuid) from public,anon;
grant execute on function public.billing_patient_consultations(uuid) to authenticated;

-- Admin room picker exposes only existing hospital_rooms rows. One room row is
-- one assignable room/bed record according to the confirmed live schema.
create or replace function public.admin_hospital_room_directory(p_search text default '')
returns table(room_id uuid,room_number text,room_type text,bed_number text,room_status text,bed_status text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  return query select r.id,to_jsonb(r)->>'room_number',coalesce(to_jsonb(r)->>'room_type',to_jsonb(r)->>'category'),
    to_jsonb(r)->>'bed_number',coalesce(to_jsonb(r)->>'status','available'),
    case when coalesce((to_jsonb(r)->>'is_demo')::boolean,false) then 'demo'
      when exists(select 1 from public.patient_admissions a where a.room_id=r.id and a.status='admitted' and a.discharge_date is null) then 'occupied'
      when lower(coalesce(to_jsonb(r)->>'status','')) in ('occupied','maintenance','cleaning','unavailable','inactive') then lower(to_jsonb(r)->>'status')
      when coalesce((to_jsonb(r)->>'available')::boolean,true)=false then 'unavailable'
      else 'available' end
  from public.hospital_rooms r
  where concat_ws(' ',to_jsonb(r)->>'room_number',to_jsonb(r)->>'room_type',to_jsonb(r)->>'category',to_jsonb(r)->>'bed_number') ilike '%'||coalesce(p_search,'')||'%'
  order by to_jsonb(r)->>'room_number',to_jsonb(r)->>'bed_number';
end;
$$;
revoke all on function public.admin_hospital_room_directory(text) from public,anon;
grant execute on function public.admin_hospital_room_directory(text) to authenticated;

create or replace function public.admin_assign_admission_room(p_admission_id uuid,p_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admission public.patient_admissions%rowtype;
begin
  if not public.can_manage_patient_area('admissions') then raise exception 'Admissions permission required' using errcode='42501'; end if;
  select * into v_admission from public.patient_admissions where id=p_admission_id for update;
  if not found or v_admission.status<>'admitted' or v_admission.discharge_date is not null then raise exception 'An active admitted record is required' using errcode='22023'; end if;
  if coalesce((to_jsonb(v_admission)->>'is_demo')::boolean,false) then raise exception 'Demo admissions cannot receive genuine assignments' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_admission.patient_id and upper(p.role::text)='PATIENT') then raise exception 'Patient account not found' using errcode='P0002'; end if;
  perform 1 from public.hospital_rooms where id=p_room_id for update;
  if not found then raise exception 'Room was not found' using errcode='23503'; end if;
  if coalesce((select (to_jsonb(r)->>'is_demo')::boolean from public.hospital_rooms r where r.id=p_room_id),false) then raise exception 'Demo rooms cannot be assigned to genuine admissions' using errcode='22023'; end if;
  if exists(select 1 from public.patient_admissions a where a.room_id=p_room_id and a.id<>p_admission_id and a.status='admitted' and a.discharge_date is null) then raise exception 'Room is already assigned to an active admission' using errcode='23505'; end if;
  update public.patient_admissions set room_id=p_room_id where id=p_admission_id;
end;
$$;
revoke all on function public.admin_assign_admission_room(uuid,uuid) from public,anon;
grant execute on function public.admin_assign_admission_room(uuid,uuid) to authenticated;

-- Assigning a doctor updates only the active admission's authoritative FK.
create or replace function public.admin_assign_patient_doctor_for_care(
  p_patient_id uuid,p_doctor_id uuid,p_admission_id uuid default null,p_department text default '',p_consultation_type text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_admission uuid;
begin
  if not public.can_manage_patient_area('care_management') then raise exception 'Care management permission required' using errcode='42501'; end if;
  if p_doctor_id is null or not exists(select 1 from public.doctors d where d.id=p_doctor_id and coalesce((to_jsonb(d)->>'is_demo')::boolean,false)=false and coalesce((to_jsonb(d)->>'available')::boolean,true)) then raise exception 'Select an available genuine doctor' using errcode='23503'; end if;
  select a.id into v_admission from public.patient_admissions a where a.patient_id=p_patient_id and a.status='admitted' and a.discharge_date is null and (p_admission_id is null or a.id=p_admission_id) order by a.admission_date desc limit 1 for update;
  if v_admission is null then raise exception 'An active admission for this patient is required' using errcode='22023'; end if;
  update public.patient_admissions set doctor_id=p_doctor_id,department=coalesce(nullif(btrim(p_department),''),department) where id=v_admission;
  return v_admission;
end;
$$;
revoke all on function public.admin_assign_patient_doctor_for_care(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.admin_assign_patient_doctor_for_care(uuid,uuid,uuid,text,text) to authenticated;

notify pgrst,'reload schema';
commit;
