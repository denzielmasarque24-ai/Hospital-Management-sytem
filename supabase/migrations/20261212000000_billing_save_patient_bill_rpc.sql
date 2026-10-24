begin;

-- Keep the billing RPC contract aligned with the current admin client. Charges
-- use patient_medical_charges; discounts and taxes remain on patient_bills.
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
  v_room record;
  v_product public.products%rowtype;
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
    select 1 from public.patient_admissions a where a.id=p_admission_id and a.patient_id=p_patient_id
  ) then raise exception 'Admission does not belong to this patient' using errcode='23503'; end if;

  -- Serialize retries and room period checks. All changes below are atomic.
  perform pg_advisory_xact_lock(hashtextextended(p_external_reference::text,0));
  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text,1));
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
    begin
      v_qty:=nullif(v_item->>'quantity','')::numeric;
      v_price:=nullif(v_item->>'unit_price','')::numeric;
      v_description:=btrim(coalesce(v_item->>'description',''));
      v_period_start:=nullif(v_item->>'period_start','')::date;
      v_period_end:=nullif(v_item->>'period_end','')::date;
    exception when others then
      raise exception 'Charge quantity, price, or dates are invalid' using errcode='22023';
    end;
    if v_description='' or v_qty is null or v_qty<=0 or v_qty>100000 or v_qty<>round(v_qty,3)
      or v_price is null or v_price<0 or v_price>999999999 or v_price<>round(v_price,2)
      or coalesce(v_item->>'category','') not in ('room','consultation','laboratory','diagnostic','medicine','medical_supply','hospital_service','other') then
      raise exception 'Each item requires a valid description, category, positive quantity, and verified price' using errcode='22023';
    end if;
    if v_item->>'category' in ('medicine','medical_supply') and nullif(v_item->>'inventory_product_id','') is null then
      raise exception 'Medical products and supplies must reference a catalog product' using errcode='22023';
    end if;
    if nullif(v_item->>'inventory_product_id','') is not null then
      if v_qty<>trunc(v_qty) then raise exception 'Product supply quantities must be whole numbers' using errcode='22023'; end if;
      select * into v_product from public.products where id=(v_item->>'inventory_product_id')::uuid and available is true for share;
      if not found or v_product.stock<v_qty or v_product.price<>v_price then
        raise exception 'Product is unavailable, out of stock, or its catalog price changed' using errcode='22023';
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
      select s.name into v_description from public.services s where s.id=(v_item->>'service_id')::uuid;
      if not found then raise exception 'Selected service could not be verified' using errcode='22023'; end if;
    end if;
    if v_item->>'category'='hospital_service' and nullif(v_item->>'service_id','') is null then
      raise exception 'Hospital services must reference an existing service record' using errcode='22023';
    end if;
    if v_item->>'category'='consultation' then
      if nullif(v_item->>'consultation_record_id','') is null then
        raise exception 'Professional fees must reference a released care record for this patient and doctor' using errcode='22023';
      end if;
      select concat_ws(' · ',nullif(btrim(r.reason),''),'Dr. '||d.first_name||' '||d.last_name)
        into v_description from public.patient_medical_records r join public.doctors d on d.id=r.doctor_id
        where r.id=(v_item->>'consultation_record_id')::uuid and r.patient_id=p_patient_id
          and r.doctor_id=nullif(v_item->>'doctor_id','')::uuid and r.status in ('released','amended') and r.released_at is not null;
      if not found then raise exception 'Professional fees must reference a released care record for this patient and doctor' using errcode='22023'; end if;
    end if;
    if v_item->>'category'='other' and nullif(btrim(v_item->>'supporting_reason'),'') is null then
      raise exception 'Additional charges require a supporting reason' using errcode='22023';
    end if;
    if v_item->>'category'='room' then
      if v_period_start is null or v_period_end is null or v_period_end<v_period_start
        or v_qty<>(v_period_end-v_period_start+1) then
        raise exception 'Room charge dates and billable days must match' using errcode='22023';
      end if;
      if p_admission_id is null or nullif(v_item->>'room_assignment_id','') is null then
        raise exception 'Room charges require the patient''s actual room assignment' using errcode='22023';
      end if;
      select ra.id,ra.room_number,ra.daily_rate,ra.assigned_at,ra.released_at into v_room
        from public.patient_room_assignments ra where ra.id=(v_item->>'room_assignment_id')::uuid
          and ra.patient_id=p_patient_id and ra.admission_id=p_admission_id for share;
      if not found or v_period_start<v_room.assigned_at::date or v_period_end>coalesce(v_room.released_at::date,current_date) then
        raise exception 'Room charges must match this patient''s actual room assignment and dates' using errcode='22023';
      end if;
      if v_room.daily_rate is not null and v_price<>v_room.daily_rate then
        raise exception 'Room daily price must match the approved rate captured on this assignment' using errcode='22023';
      end if;
      v_description:='Room '||v_room.room_number||' accommodation';
      if exists(select 1 from public.patient_medical_charges c where c.patient_id=p_patient_id and c.category='room'
        and c.is_demo is false and c.service_period_start is not null and c.service_period_end is not null
        and c.service_period_start<=v_period_end and c.service_period_end>=v_period_start
        and (p_bill_id is null or c.bill_id is distinct from p_bill_id)) then
        raise exception 'This room period overlaps another saved bill charge' using errcode='23P01';
      end if;
    end if;
    insert into public.patient_medical_charges(patient_id,admission_id,bill_id,item_name,category,quantity,unit_price,
      recorded_by,inventory_product_id,supporting_reason,service_id,professional_doctor_id,consultation_record_id,
      room_assignment_id,service_date,service_period_start,service_period_end,is_demo)
    values(p_patient_id,p_admission_id,v_bill,v_description,v_item->>'category',v_qty,v_price,auth.uid(),
      nullif(v_item->>'inventory_product_id','')::uuid,nullif(btrim(v_item->>'supporting_reason'),''),
      nullif(v_item->>'service_id','')::uuid,nullif(v_item->>'doctor_id','')::uuid,
      nullif(v_item->>'consultation_record_id','')::uuid,nullif(v_item->>'room_assignment_id','')::uuid,
      coalesce(nullif(v_item->>'service_date','')::date,current_date),v_period_start,v_period_end,false);
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
  return jsonb_build_object('bill_id',v_bill,'bill_number',v_number,'total_amount',v_total,'finalized',p_finalize);
end;
$$;

comment on function public.billing_save_patient_bill(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean) is
  'Billing-authorized atomic draft/finalize RPC. p_items is a JSONB array of charge objects with description, category, quantity, unit_price, and optional inventory_product_id, service_id, room_assignment_id, doctor_id, consultation_record_id, service_date, period_start, period_end, and supporting_reason. _patient_id is compatibility metadata only; the patient is independently authorized and validated.';

-- Compatibility for clients currently sending the eight named arguments in
-- the reported PGRST202. New clients send p_patient_id explicitly. This
-- overload derives it from the bill/admission or the reserved _patient_id
-- item metadata, then delegates to the same authorization-checked function.
create or replace function public.billing_save_patient_bill(
  p_admission_id uuid,
  p_bill_id uuid,
  p_discount numeric,
  p_discount_reason text,
  p_external_reference uuid,
  p_finalize boolean,
  p_items jsonb,
  p_taxes numeric
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_patient_id uuid;
begin
  if not public.can_manage_patient_area('billing') then
    raise exception 'Billing permission required' using errcode='42501';
  end if;
  if p_bill_id is not null then
    select patient_id into v_patient_id from public.patient_bills where id=p_bill_id;
  elsif p_admission_id is not null then
    select patient_id into v_patient_id from public.patient_admissions where id=p_admission_id;
  elsif jsonb_typeof(p_items)='array' then
    if jsonb_array_length(p_items)>0 then
      begin v_patient_id:=nullif(p_items->0->>'_patient_id','')::uuid;
      exception when others then raise exception 'Refresh the billing page so the patient reference can be sent' using errcode='22023'; end;
    end if;
  end if;
  if v_patient_id is null then raise exception 'A patient reference is required to create this bill' using errcode='22023'; end if;
  if jsonb_typeof(p_items)='array' then
    begin
      if exists(select 1 from jsonb_array_elements(p_items) item where nullif(item->>'_patient_id','') is not null
        and (item->>'_patient_id')::uuid is distinct from v_patient_id) then
        raise exception 'Charge patient references do not match' using errcode='22023';
      end if;
    exception when invalid_text_representation then
      raise exception 'Charge patient reference is invalid' using errcode='22023';
    end;
  end if;
  return public.billing_save_patient_bill(p_bill_id,p_external_reference,v_patient_id,p_admission_id,
    p_items,p_discount,p_discount_reason,p_taxes,p_finalize);
end;
$$;

comment on function public.billing_save_patient_bill(uuid,uuid,numeric,text,uuid,boolean,jsonb,numeric) is
  'Compatibility overload for the eight named PostgREST arguments reported by PGRST202; resolves patient ownership from the bill, admission, or _patient_id item metadata and delegates to the protected canonical RPC.';

revoke all on function public.billing_save_patient_bill(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean) from public,anon;
grant execute on function public.billing_save_patient_bill(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean) to authenticated;
revoke all on function public.billing_save_patient_bill(uuid,uuid,numeric,text,uuid,boolean,jsonb,numeric) from public,anon;
grant execute on function public.billing_save_patient_bill(uuid,uuid,numeric,text,uuid,boolean,jsonb,numeric) to authenticated;

notify pgrst,'reload schema';
commit;
