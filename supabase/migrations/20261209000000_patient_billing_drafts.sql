begin;

-- Keep the existing authoritative billing tables. Drafts remain real, private
-- records until payment_approved_at is set by the finalize operation.
alter table public.patient_medical_charges
  add column if not exists supporting_reason text,
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists professional_doctor_id uuid references public.doctors(id) on delete set null,
  add column if not exists consultation_record_id uuid references public.patient_medical_records(id) on delete set null,
  add column if not exists room_assignment_id uuid references public.patient_room_assignments(id) on delete set null,
  add column if not exists service_date date,
  add column if not exists service_period_start date,
  add column if not exists service_period_end date;
alter table public.patient_bills add column if not exists discount_reason text;

-- Drafts use the bill and charge tables, so RLS must keep them invisible to
-- patient sessions until billing authorization finalizes them.
drop policy if exists "Patients read own bills" on public.patient_bills;
drop policy if exists "Authorized staff read patient bills" on public.patient_bills;
create policy "Patients read finalized bills and billing staff read all"
  on public.patient_bills for select to authenticated
  using ((patient_id = (select auth.uid()) and payment_approved_at is not null)
    or public.can_manage_patient_area('billing'));

drop policy if exists "Patients read own medical charges" on public.patient_medical_charges;
drop policy if exists "Authorized staff read patient medical charges" on public.patient_medical_charges;
create policy "Patients read finalized charges and billing staff read all"
  on public.patient_medical_charges for select to authenticated
  using ((patient_id = (select auth.uid()) and (bill_id is null or exists (
      select 1 from public.patient_bills b where b.id = patient_medical_charges.bill_id
        and b.patient_id = patient_medical_charges.patient_id and b.payment_approved_at is not null
    ))) or public.can_manage_patient_area('billing') or public.can_manage_patient_area('inventory'));

-- The billing screen uses the established directory RPC. Permit both admins
-- and staff with the existing billing permission to use it.
create or replace function public.admin_patient_directory(
  p_search text default '', p_limit integer default 20, p_offset integer default 0
)
returns table (patient_id uuid, full_name text, email text, phone text, registered_at timestamptz, total_count bigint)
language plpgsql stable security definer set search_path = ''
as $directory$
begin
  if coalesce(public.current_admin_role(), '') not in ('ADMIN','SUPER_ADMIN') and not public.can_manage_patient_area('billing') then
    raise exception 'Billing permission required' using errcode = '42501';
  end if;
  return query
  select u.id,
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name, profile.suffix)), ''), 'Patient'),
    coalesce(u.email, ''), coalesce(nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''), nullif(btrim(profile.phone), ''), nullif(btrim(profile.mobile_number), ''), ''), u.created_at, count(*) over ()
  from auth.users u join public.profiles profile on profile.id = u.id
  where upper(coalesce(profile.role, '')) = 'PATIENT'
    and (coalesce(btrim(p_search), '') = '' or u.id::text ilike '%' || btrim(p_search) || '%'
      or coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '') ilike '%' || btrim(p_search) || '%'
      or coalesce(u.email, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(u.raw_user_meta_data ->> 'phone', '') ilike '%' || btrim(p_search) || '%'
      or concat_ws(' ', profile.first_name, profile.middle_name, profile.last_name, profile.suffix) ilike '%' || btrim(p_search) || '%'
      or coalesce(profile.phone, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(profile.mobile_number, '') ilike '%' || btrim(p_search) || '%')
  order by u.created_at desc, u.id limit greatest(1, least(coalesce(p_limit, 20), 100)) offset greatest(coalesce(p_offset, 0), 0);
end;
$directory$;

create or replace function public.billing_patient_consultations(p_patient_id uuid)
returns table(record_id uuid, doctor_id uuid, occurred_at timestamptz, record_type text, reason text, doctor_name text, specialty text)
language plpgsql stable security definer set search_path = ''
as $consultations$
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_patient_id and upper(p.role::text) = 'PATIENT') then
    raise exception 'Patient account not found' using errcode = 'P0002';
  end if;
  return query
  select r.id, r.doctor_id, r.occurred_at, r.record_type, r.reason,
    'Dr. ' || d.first_name || ' ' || d.last_name, d.specialization
  from public.patient_medical_records r
  join public.doctors d on d.id = r.doctor_id
  where r.patient_id = p_patient_id and r.status in ('released','amended') and r.released_at is not null
    and r.record_type in ('consultation','check_up','diagnostic')
  order by r.occurred_at desc limit 100;
end;
$consultations$;

create or replace function public.billing_patient_care_details(p_patient_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $care$
declare
  v_admission public.patient_admissions%rowtype;
  v_room public.patient_room_assignments%rowtype;
  v_doctor_name text;
  v_specialty text;
  v_rate numeric;
begin
  if not public.can_manage_patient_area('billing') then raise exception 'Billing permission required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_patient_id and upper(p.role::text) = 'PATIENT') then
    raise exception 'Patient account not found' using errcode = 'P0002';
  end if;
  select * into v_admission from public.patient_admissions a
    where a.patient_id = p_patient_id and a.status in ('admitted','discharged')
    order by a.admission_date desc limit 1;
  if v_admission.id is not null then
    select * into v_room from public.patient_room_assignments r
      where r.admission_id = v_admission.id and r.patient_id = p_patient_id
      order by r.assigned_at desc limit 1;
    if v_admission.doctor_id is not null then
      select 'Dr. ' || d.first_name || ' ' || d.last_name, d.specialization into v_doctor_name, v_specialty
      from public.doctors d where d.id = v_admission.doctor_id;
    end if;
    if v_room.room_type is not null then
      select c.daily_rate into v_rate from public.room_categories c
        where c.slug = lower(regexp_replace(trim(v_room.room_type), '[^a-zA-Z0-9]+', '-', 'g'))
          and c.is_active is true and c.is_demo_rate is false limit 1;
    end if;
  end if;
  return jsonb_build_object(
    'admission_id', v_admission.id, 'admission_number', v_admission.admission_number,
    'admission_status', v_admission.status, 'admission_date', v_admission.admission_date,
    'discharge_date', v_admission.discharge_date, 'doctor_id', v_admission.doctor_id,
    'doctor_name', v_doctor_name, 'specialty', v_specialty,
    'room_assignment_id', v_room.id, 'room_number', v_room.room_number, 'room_type', v_room.room_type,
    'room_start_date', v_room.assigned_at::date, 'room_end_date', v_room.released_at::date, 'daily_rate', v_rate
  );
end;
$care$;

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
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
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
  v_room_number text;
  v_product public.products%rowtype;
begin
  if not public.can_manage_patient_area('billing') then
    raise exception 'Billing permission required' using errcode = '42501';
  end if;
  if p_patient_id is null or p_external_reference is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Patient, idempotency reference, and at least one item are required' using errcode = '22023';
  end if;
  if coalesce(p_discount, 0) < 0 or coalesce(p_taxes, 0) < 0
    or coalesce(p_discount, 0) <> round(coalesce(p_discount, 0), 2)
    or coalesce(p_taxes, 0) <> round(coalesce(p_taxes, 0), 2)
    or p_discount > 999999999 or p_taxes > 999999999 then
    raise exception 'Discount and taxes must be valid nonnegative amounts' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_patient_id and upper(p.role::text) = 'PATIENT') then
    raise exception 'Patient account not found' using errcode = 'P0002';
  end if;
  if p_admission_id is not null and not exists (select 1 from public.patient_admissions a where a.id = p_admission_id and a.patient_id = p_patient_id) then
    raise exception 'Admission does not belong to this patient' using errcode = '23503';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_external_reference::text, 0));
  -- Serialize edits for one patient so concurrent drafts cannot both pass the
  -- room-period overlap check and commit the same stay dates.
  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text, 1));
  if p_bill_id is not null then
    select * into v_existing from public.patient_bills where id = p_bill_id for update;
    if not found or v_existing.patient_id <> p_patient_id or v_existing.is_demo is distinct from false
      or coalesce(v_existing.bill_number,'') ~* '^DEMO[-_]' or v_existing.payment_approved_at is not null or v_existing.status = 'paid' then
      raise exception 'Only this patient''s unfinalized genuine draft can be edited' using errcode = '42501';
    end if;
    if exists (select 1 from public.patient_payments where bill_id = p_bill_id and is_demo is false and status in ('completed','paid','succeeded')) then
      raise exception 'A bill with verified payments cannot be edited' using errcode = '55000';
    end if;
    v_bill := p_bill_id;
    v_number := v_existing.bill_number;
    delete from public.patient_medical_charges where bill_id = v_bill and patient_id = p_patient_id and is_demo is false;
  else
    select * into v_existing from public.patient_bills where external_reference = p_external_reference for update;
    v_bill := v_existing.id;
    v_number := v_existing.bill_number;
    if v_bill is not null then
      select * into v_existing from public.patient_bills where id = v_bill for update;
      if v_existing.patient_id <> p_patient_id or v_existing.is_demo is distinct from false
        or coalesce(v_existing.bill_number,'') ~* '^DEMO[-_]' or v_existing.payment_approved_at is not null or v_existing.status = 'paid' then
        raise exception 'The idempotency reference belongs to a different or finalized bill' using errcode = '23505';
      end if;
      delete from public.patient_medical_charges where bill_id = v_bill and patient_id = p_patient_id and is_demo is false;
    else
      v_number := 'B-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
      insert into public.patient_bills(patient_id, admission_id, bill_number, description, total_amount, approved_discount, taxes_and_fees, external_reference, is_demo, status)
      values (p_patient_id, p_admission_id, v_number, 'Patient hospital charges', 0, 0, 0, p_external_reference, false, 'unpaid') returning id into v_bill;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as entries(value) loop
    v_qty := nullif(v_item->>'quantity','')::numeric;
    v_price := nullif(v_item->>'unit_price','')::numeric;
    v_description := btrim(coalesce(v_item->>'description',''));
    if btrim(coalesce(v_item->>'description','')) = '' or v_qty is null or v_qty <= 0 or v_qty > 100000 or v_qty <> round(v_qty, 3)
      or v_price is null or v_price < 0 or v_price > 999999999 or v_price <> round(v_price, 2)
      or lower(v_qty::text) in ('nan','infinity','-infinity') or lower(v_price::text) in ('nan','infinity','-infinity')
      or coalesce(v_item->>'category','') not in ('room','consultation','laboratory','diagnostic','medicine','medical_supply','hospital_service','other') then
      raise exception 'Each item requires a valid description, category, positive quantity, and verified price' using errcode = '22023';
    end if;
    if v_item->>'category' in ('medicine','medical_supply') and nullif(v_item->>'inventory_product_id','') is null then
      raise exception 'Medical products and supplies must reference a catalog product' using errcode = '22023';
    end if;
    if nullif(v_item->>'inventory_product_id','') is not null then
      if v_qty <> trunc(v_qty) then raise exception 'Product supply quantities must be whole numbers' using errcode = '22023'; end if;
      select * into v_product from public.products where id = (v_item->>'inventory_product_id')::uuid and available is true for share;
      if not found or v_product.stock < v_qty or v_product.price <> v_price then
        raise exception 'Product is unavailable, out of stock, or its catalog price changed' using errcode = '22023';
      end if;
      v_description := v_product.name;
      if p_finalize then
        update public.products set stock = stock - v_qty, updated_at = now()
          where id = v_product.id and stock >= v_qty;
        if not found then raise exception 'Insufficient product stock at finalization' using errcode = '22023'; end if;
        insert into public.inventory_adjustments(product_id, quantity, note, adjusted_by)
          values(v_product.id, -v_qty, 'Patient bill ' || coalesce(v_number, v_bill::text), auth.uid());
      end if;
    end if;
    if nullif(v_item->>'service_id','') is not null then
      select s.name into v_description from public.services s where s.id = (v_item->>'service_id')::uuid;
      if not found then raise exception 'Selected service could not be verified' using errcode = '22023'; end if;
    end if;
    if v_item->>'category' = 'hospital_service' and nullif(v_item->>'service_id','') is null then
      raise exception 'Hospital services must reference an existing service record' using errcode = '22023';
    end if;
    if v_item->>'category' = 'consultation' then
      if nullif(v_item->>'consultation_record_id','') is null then
        raise exception 'Professional fees must reference a released care record for this patient and doctor' using errcode = '22023';
      end if;
      select concat_ws(' — ', nullif(btrim(r.reason), ''), 'Dr. ' || d.first_name || ' ' || d.last_name)
        into v_description
      from public.patient_medical_records r join public.doctors d on d.id = r.doctor_id
      where r.id = (v_item->>'consultation_record_id')::uuid and r.patient_id = p_patient_id
        and r.doctor_id = nullif(v_item->>'doctor_id','')::uuid and r.status in ('released','amended') and r.released_at is not null;
      if not found then raise exception 'Professional fees must reference a released care record for this patient and doctor' using errcode = '22023'; end if;
    end if;
    if v_item->>'category' = 'other' and nullif(btrim(v_item->>'supporting_reason'),'') is null then
      raise exception 'Additional charges require a supporting reason' using errcode = '22023';
    end if;
    v_period_start := nullif(v_item->>'period_start','')::date;
    v_period_end := nullif(v_item->>'period_end','')::date;
    if v_item->>'category' = 'room' then
      if v_period_start is null or v_period_end is null or v_period_end < v_period_start or v_qty <> (v_period_end - v_period_start + 1) then
        raise exception 'Room charge dates and billable days must match' using errcode = '22023';
      end if;
      if p_admission_id is null or nullif(v_item->>'room_assignment_id','') is null or not exists (
        select 1 from public.patient_room_assignments ra
        where ra.id = (v_item->>'room_assignment_id')::uuid and ra.patient_id = p_patient_id
          and ra.admission_id = p_admission_id and v_period_start >= ra.assigned_at::date
          and v_period_end <= coalesce(ra.released_at::date, current_date)
      ) then
        raise exception 'Room charges must match this patient''s actual room assignment and dates' using errcode = '22023';
      end if;
      select ra.room_number into v_room_number from public.patient_room_assignments ra where ra.id = (v_item->>'room_assignment_id')::uuid;
      v_description := 'Room ' || v_room_number || ' accommodation';
      if exists (
        select 1 from public.patient_medical_charges existing
        where existing.patient_id = p_patient_id and existing.category = 'room' and existing.is_demo is false
          and existing.service_period_start is not null and existing.service_period_end is not null
          and existing.service_period_start <= v_period_end and existing.service_period_end >= v_period_start
      ) then
        raise exception 'This room period overlaps another saved bill charge' using errcode = '23P01';
      end if;
    end if;
    insert into public.patient_medical_charges(
      patient_id, admission_id, bill_id, item_name, category, quantity, unit_price,
      recorded_by, inventory_product_id, supporting_reason, service_id,
      professional_doctor_id, consultation_record_id, room_assignment_id, service_date, service_period_start, service_period_end, is_demo
    ) values (
      p_patient_id, p_admission_id, v_bill, v_description, v_item->>'category', v_qty, v_price,
      auth.uid(), nullif(v_item->>'inventory_product_id','')::uuid, nullif(btrim(v_item->>'supporting_reason'),''),
      nullif(v_item->>'service_id','')::uuid, nullif(v_item->>'doctor_id','')::uuid,
      nullif(v_item->>'consultation_record_id','')::uuid,
      nullif(v_item->>'room_assignment_id','')::uuid,
      coalesce(nullif(v_item->>'service_date','')::date, current_date), v_period_start, v_period_end, false
    );
  end loop;

  select round(coalesce(sum(quantity * unit_price), 0), 2) into v_subtotal
  from public.patient_medical_charges where bill_id = v_bill and patient_id = p_patient_id and is_demo is false;
  if p_discount > v_subtotal then raise exception 'Discount cannot exceed the subtotal' using errcode = '22023'; end if;
  v_total := round(v_subtotal - coalesce(p_discount, 0) + coalesce(p_taxes, 0), 2);
  if coalesce(p_discount, 0) > 0 and nullif(btrim(p_discount_reason), '') is null then
    raise exception 'An approval reason is required for a discount' using errcode = '22023';
  end if;
  update public.patient_bills set admission_id = p_admission_id, total_amount = v_total,
    approved_discount = coalesce(p_discount, 0), discount_reason = nullif(btrim(p_discount_reason), ''),
    taxes_and_fees = coalesce(p_taxes, 0), description = 'Patient hospital charges'
  where id = v_bill;

  if p_finalize then
    if exists (select 1 from public.online_payments where bill_id = v_bill and status in ('creating','pending')) then
      raise exception 'Resolve active payment attempts before finalizing this bill' using errcode = '55000';
    end if;
    update public.patient_bills set payment_approved_at = now(), payment_approved_by = auth.uid(), issued_at = now()
      where id = v_bill and is_demo is false and payment_approved_at is null;
  end if;
  return jsonb_build_object('bill_id', v_bill, 'bill_number', v_number, 'total_amount', v_total, 'finalized', p_finalize);
end;
$function$;

revoke all on function public.billing_save_patient_bill(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean) from public, anon;
grant execute on function public.billing_save_patient_bill(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean) to authenticated;
revoke all on function public.billing_patient_consultations(uuid) from public, anon;
grant execute on function public.billing_patient_consultations(uuid) to authenticated;
revoke all on function public.billing_patient_care_details(uuid) from public, anon;
grant execute on function public.billing_patient_care_details(uuid) to authenticated;
revoke all on function public.admin_patient_directory(text,integer,integer) from public, anon;
grant execute on function public.admin_patient_directory(text,integer,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
