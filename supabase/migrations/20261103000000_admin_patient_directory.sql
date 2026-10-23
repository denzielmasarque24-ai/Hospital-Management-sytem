-- Admin-only, read-only directory for authenticated Patient accounts.
-- Uses auth.users metadata and public.profiles so it does not depend on the
-- optional patient portal profile table being present in every deployment.
create or replace function public.admin_patient_directory(
  p_search text default '',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  patient_id uuid,
  full_name text,
  email text,
  phone text,
  registered_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if public.current_admin_role() not in ('ADMIN', 'SUPER_ADMIN') then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      'Patient'
    ),
    coalesce(u.email, ''),
    coalesce(nullif(btrim(u.raw_user_meta_data ->> 'phone'), ''), ''),
    u.created_at,
    count(*) over ()
  from auth.users as u
  join public.profiles as profile on profile.id = u.id
  where upper(coalesce(profile.role, '')) = 'PATIENT'
    and (
      coalesce(btrim(p_search), '') = ''
      or u.id::text ilike '%' || btrim(p_search) || '%'
      or coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '') ilike '%' || btrim(p_search) || '%'
      or coalesce(u.email, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(u.raw_user_meta_data ->> 'phone', '') ilike '%' || btrim(p_search) || '%'
    )
  -- No portal-profile join is required: this works against the deployed
  -- auth.users + profiles schema while returning only directory fields.
  order by u.created_at desc, u.id
  limit greatest(1, least(coalesce(p_limit, 20), 100))
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

create or replace function public.admin_patient_count()
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  patient_total bigint;
begin
  if public.current_admin_role() not in ('ADMIN', 'SUPER_ADMIN') then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  select count(*) into patient_total
  from auth.users as u
  join public.profiles as profile on profile.id = u.id
  where upper(coalesce(profile.role, '')) = 'PATIENT';

  return patient_total;
end;
$function$;

revoke all on function public.admin_patient_directory(text, integer, integer) from public, anon;
revoke all on function public.admin_patient_count() from public, anon;
grant execute on function public.admin_patient_directory(text, integer, integer) to authenticated;
grant execute on function public.admin_patient_count() to authenticated;

notify pgrst, 'reload schema';
