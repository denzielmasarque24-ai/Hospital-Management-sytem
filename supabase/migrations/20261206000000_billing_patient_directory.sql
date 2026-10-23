begin;

-- A billing-authorized staff directory for selecting the patient on a bill.
-- This exposes only the minimum contact fields needed by the admin form.
create or replace function public.billing_patient_directory(
  p_search text default '',
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  patient_id uuid,
  full_name text,
  email text,
  phone text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.can_manage_patient_area('billing') then
    raise exception 'Billing permission required' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    coalesce(
      nullif(btrim(concat_ws(' ',
        nullif(btrim(p.first_name), ''),
        nullif(btrim(p.middle_name), ''),
        nullif(btrim(p.last_name), ''),
        nullif(btrim(p.suffix), '')
      )), ''),
      'Name not provided'
    ),
    nullif(btrim(coalesce(p.email, '')), ''),
    coalesce(nullif(btrim(p.phone), ''), nullif(btrim(p.mobile_number), ''), '')
  from public.profiles p
  where upper(coalesce(p.role::text, '')) = 'PATIENT'
    and (
      coalesce(btrim(p_search), '') = ''
      or p.id::text ilike '%' || btrim(p_search) || '%'
      or concat_ws(' ', p.first_name, p.middle_name, p.last_name, p.suffix) ilike '%' || btrim(p_search) || '%'
      or coalesce(p.email, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(p.phone, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(p.mobile_number, '') ilike '%' || btrim(p_search) || '%'
    )
  order by lower(coalesce(p.last_name, '')), lower(coalesce(p.first_name, '')), p.id
  limit greatest(1, least(coalesce(p_limit, 100), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

revoke all on function public.billing_patient_directory(text, integer, integer) from public, anon;
grant execute on function public.billing_patient_directory(text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
