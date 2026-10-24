begin;

-- Keep doctor assignment history in the existing care assignment table and
-- synchronize the selected doctor onto the patient's current admission.
create or replace function public.admin_assign_patient_doctor_for_care(
  p_patient_id uuid,
  p_doctor_id uuid,
  p_admission_id uuid default null,
  p_department text default '',
  p_consultation_type text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_assignment_id uuid;
begin
  if not public.can_manage_patient_area('care_management') then
    raise exception 'Care management permission required' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then
    raise exception 'Patient account not found' using errcode='P0002';
  end if;
  if p_doctor_id is null then raise exception 'Select an active doctor' using errcode='22023'; end if;
  if not exists(select 1 from public.doctors d where d.id=p_doctor_id and d.status='active') then
    raise exception 'Select an active doctor' using errcode='23503';
  end if;
  if p_admission_id is not null and not exists(
    select 1 from public.patient_admissions a where a.id=p_admission_id and a.patient_id=p_patient_id
      and a.status in ('pending','admitted')
  ) then raise exception 'Admission does not belong to this patient or is no longer active' using errcode='23503'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text,0));
  update public.patient_doctor_assignments set active=false where patient_id=p_patient_id and active;
  insert into public.patient_doctor_assignments(patient_id,doctor_id,department,consultation_type,active)
    values(p_patient_id,p_doctor_id,coalesce(nullif(btrim(p_department),''),''),coalesce(nullif(btrim(p_consultation_type),''),''),true)
    returning id into v_assignment_id;
  if p_admission_id is not null then
    update public.patient_admissions set doctor_id=p_doctor_id,department=coalesce(nullif(btrim(p_department),''),department)
      where id=p_admission_id and patient_id=p_patient_id;
  end if;
  return v_assignment_id;
end;
$$;

revoke all on function public.admin_assign_patient_doctor_for_care(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.admin_assign_patient_doctor_for_care(uuid,uuid,uuid,text,text) to authenticated;

-- The billing editor shows only genuine, verified net payments grouped by bill.
create or replace function public.billing_patient_payment_summary(p_patient_id uuid)
returns table(bill_id uuid,verified_paid numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_patient_area('billing') then
    raise exception 'Billing permission required' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then
    raise exception 'Patient account not found' using errcode='P0002';
  end if;
  return query
  select p.bill_id,round(sum(greatest(p.amount-coalesce(r.refund_amount,0),0)),2)
  from public.patient_payments p
  join public.patient_bills b on b.id=p.bill_id and b.patient_id=p.patient_id and b.is_demo is false
  left join lateral(select sum(x.amount) refund_amount from public.online_payment_refunds x
    where x.online_payment_id=p.external_reference and x.status='succeeded') r on true
  where p.patient_id=p_patient_id and p.is_demo is false
    and p.status in ('completed','paid','succeeded','refunded')
  group by p.bill_id;
end;
$$;
revoke all on function public.billing_patient_payment_summary(uuid) from public,anon;
grant execute on function public.billing_patient_payment_summary(uuid) to authenticated;

-- Return the current care assignment first, then fall back to the doctor stored
-- on the selected admission for records created before assignments existed.
create or replace function public.billing_patient_care_details(p_patient_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_admission public.patient_admissions%rowtype;
  v_room public.patient_room_assignments%rowtype;
  v_assignment public.patient_doctor_assignments%rowtype;
  v_doctor_name text;
  v_specialty text;
  v_photo text;
  v_department text;
  v_bed_status text;
  v_rate numeric;
begin
  if not public.can_manage_patient_area('billing') then
    raise exception 'Billing permission required' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then
    raise exception 'Patient account not found' using errcode='P0002';
  end if;

  select * into v_admission from public.patient_admissions a
    where a.patient_id=p_patient_id and a.status in ('admitted','discharged')
    order by (a.status='admitted') desc,a.admission_date desc limit 1;
  select * into v_assignment from public.patient_doctor_assignments d
    where d.patient_id=p_patient_id and d.active is true order by d.assigned_at desc limit 1;
  if v_assignment.doctor_id is not null then
    select 'Dr. '||d.first_name||' '||d.last_name,d.specialization,d.photo_url
      into v_doctor_name,v_specialty,v_photo from public.doctors d where d.id=v_assignment.doctor_id;
    v_department:=coalesce(nullif(v_assignment.department,''),nullif(v_admission.department,''));
  elsif v_admission.doctor_id is not null then
    select 'Dr. '||d.first_name||' '||d.last_name,d.specialization,d.photo_url
      into v_doctor_name,v_specialty,v_photo from public.doctors d where d.id=v_admission.doctor_id;
    v_department:=v_admission.department;
  end if;
  if v_admission.id is not null then
    select * into v_room from public.patient_room_assignments r
      where r.admission_id=v_admission.id and r.patient_id=p_patient_id
        and (v_admission.status='discharged' or r.status='assigned')
      order by r.assigned_at desc limit 1;
    if v_room.bed_id is not null then
      select b.status into v_bed_status from public.patient_beds b where b.id=v_room.bed_id;
    end if;
    v_rate:=v_room.daily_rate;
    if v_rate is null and v_room.room_type is not null then
      select c.daily_rate into v_rate from public.room_categories c
        where c.slug=lower(regexp_replace(trim(v_room.room_type),'[^a-zA-Z0-9]+','-','g'))
          and c.is_active is true and c.is_demo_rate is false limit 1;
    end if;
  end if;
  return jsonb_build_object(
    'admission_id',v_admission.id,'admission_number',v_admission.admission_number,'admission_status',v_admission.status,
    'admission_date',v_admission.admission_date,'discharge_date',v_admission.discharge_date,
    'doctor_id',coalesce(v_assignment.doctor_id,v_admission.doctor_id),'doctor_name',v_doctor_name,
    'specialty',v_specialty,'doctor_photo_url',v_photo,'doctor_department',v_department,
    'doctor_assignment_id',v_assignment.id,'doctor_assigned_at',v_assignment.assigned_at,
    'doctor_assignment_active',case when v_assignment.id is not null then v_assignment.active else v_admission.doctor_id is not null end,
    'consultation_type',v_assignment.consultation_type,
    'room_assignment_id',v_room.id,'room_number',v_room.room_number,'room_type',v_room.room_type,
    'room_start_date',v_room.assigned_at::date,'room_end_date',v_room.released_at::date,
    'daily_rate',v_rate,'bed_id',v_room.bed_id,'bed_number',v_room.bed_number,'bed_status',v_bed_status,'assignment_notes',v_room.notes
  );
end;
$$;

-- A released clinical encounter may have at most one genuine professional-fee
-- charge. Serialize by encounter ID so concurrent billing submissions cannot
-- create a duplicate. Existing historical rows are left untouched.
create or replace function public.prevent_duplicate_professional_fee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_record_patient uuid;
begin
  if new.is_demo is false and new.consultation_record_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.consultation_record_id::text,7));
    select patient_id into v_record_patient from public.patient_medical_records where id=new.consultation_record_id;
    if v_record_patient is null or v_record_patient is distinct from new.patient_id then
      raise exception 'Professional fee must reference a clinical record for this patient' using errcode='23503';
    end if;
    if new.category='consultation' and (new.unit_price is null or new.unit_price<=0) then
      raise exception 'Professional fees must be greater than zero' using errcode='22023';
    end if;
    if exists(select 1 from public.patient_medical_charges c
      where c.consultation_record_id=new.consultation_record_id and c.is_demo is false and c.id is distinct from new.id) then
      raise exception 'This verified consultation or treatment already has a professional-fee charge' using errcode='23505';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists patient_medical_charges_no_duplicate_professional_fee on public.patient_medical_charges;
create trigger patient_medical_charges_no_duplicate_professional_fee
  before insert or update
  on public.patient_medical_charges for each row execute function public.prevent_duplicate_professional_fee();
revoke all on function public.prevent_duplicate_professional_fee() from public,anon,authenticated;

notify pgrst,'reload schema';
commit;
