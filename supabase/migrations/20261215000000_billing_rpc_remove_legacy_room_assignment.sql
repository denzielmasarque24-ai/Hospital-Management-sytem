begin;

-- Keep the established atomic billing workflow while removing its dependency
-- on the retired room-assignment table. Room history is not a charge.
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
      raise exception 'Additional charges require a supporting reason' using errcode='22023';
    end if;
    if v_item->>'category'='room' then
      raise exception 'Room charges require an independently verified rate and cannot be inferred from an admission assignment' using errcode='22023';
    end if;
    insert into public.patient_medical_charges(patient_id,admission_id,bill_id,item_name,category,quantity,unit_price,
      recorded_by,inventory_product_id,supporting_reason,service_id,professional_doctor_id,consultation_record_id,
      service_date,service_period_start,service_period_end,is_demo)
    values(p_patient_id,p_admission_id,v_bill,v_description,v_item->>'category',v_qty,v_price,auth.uid(),
      nullif(v_item->>'inventory_product_id','')::uuid,nullif(btrim(v_item->>'supporting_reason'),''),
      nullif(v_item->>'service_id','')::uuid,nullif(v_item->>'doctor_id','')::uuid,
      nullif(v_item->>'consultation_record_id','')::uuid,
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
  'Billing-authorized atomic draft/finalize RPC. Admission demo records and demo care records cannot be billed as genuine. Room assignments do not create charges; room charges require a separately verified financial workflow.';

notify pgrst,'reload schema';
commit;
