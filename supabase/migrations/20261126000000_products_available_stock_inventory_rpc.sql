-- Keep patient supply usage compatible with the verified products schema:
-- products.available and products.stock are the canonical fields.
do $$
begin
  if exists (
    select 1 from public.products
    group by slug
    having count(*) > 1
  ) then
    raise exception 'Duplicate product slugs exist. Resolve them before adding the unique slug index.';
  end if;
end;
$$;

create unique index if not exists products_slug_unique_idx on public.products (slug);

create or replace function public.inventory_record_patient_supply(
  p_patient_id uuid,
  p_admission_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_bill_id uuid default null,
  p_external_reference uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_charge uuid;
  v_total numeric(14,2);
  v_existing public.patient_medical_charges%rowtype;
begin
  if not public.can_manage_patient_area('inventory') then
    raise exception 'Inventory permission required' using errcode='42501';
  end if;
  if p_external_reference is null then
    raise exception 'A supply-use idempotency reference is required' using errcode='22023';
  end if;
  select * into v_existing from public.patient_medical_charges where external_reference=p_external_reference;
  if found then
    if v_existing.patient_id<>p_patient_id or v_existing.inventory_product_id<>p_product_id or v_existing.quantity<>p_quantity then
      raise exception 'Supply-use reference was reused with different details' using errcode='23505';
    end if;
    return v_existing.id;
  end if;
  if p_quantity is null or p_quantity<=0 or p_quantity<>trunc(p_quantity) then
    raise exception 'Supply quantity must be a positive whole number' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles p where p.id=p_patient_id and upper(p.role::text)='PATIENT') then
    raise exception 'Patient account not found' using errcode='P0002';
  end if;
  if p_admission_id is not null and not exists(select 1 from public.patient_admissions a where a.id=p_admission_id and a.patient_id=p_patient_id) then
    raise exception 'Admission does not belong to this patient' using errcode='23503';
  end if;
  select * into v_product from public.products where id=p_product_id and available is true for update;
  if not found then raise exception 'Active inventory item not found' using errcode='P0002'; end if;
  if v_product.stock < p_quantity then raise exception 'Insufficient inventory stock' using errcode='22023'; end if;
  if p_bill_id is not null and not exists(select 1 from public.patient_bills b where b.id=p_bill_id and b.patient_id=p_patient_id) then
    raise exception 'Bill does not belong to this patient' using errcode='23503';
  end if;
  insert into public.patient_medical_charges(patient_id,admission_id,bill_id,item_name,category,quantity,unit_price,recorded_by,inventory_product_id,external_reference)
  values(p_patient_id,p_admission_id,p_bill_id,v_product.name,'medical_supply',p_quantity,v_product.price,auth.uid(),p_product_id,p_external_reference)
  returning id into v_charge;
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

-- Public catalog visibility follows the verified `available` flag. The separate
-- admin write policy remains restricted to authorized staff roles.
drop policy if exists "public can read active products" on public.products;
create policy "public can read active products"
  on public.products
  for select
  to anon, authenticated
  using (available is true);

revoke all on function public.inventory_record_patient_supply(uuid,uuid,uuid,numeric,uuid,uuid) from public,anon;
grant execute on function public.inventory_record_patient_supply(uuid,uuid,uuid,numeric,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
