-- Repair the Admin patient-count RPC signature in environments where the
-- earlier patient-directory migration was not applied or PostgREST is stale.
-- The function returns only an aggregate and is executable by authorized
-- Admin accounts; it does not expose patient records.
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
  if coalesce(public.current_admin_role(), '') not in ('ADMIN', 'SUPER_ADMIN') then
    raise exception 'Administrator access required.' using errcode = '42501';
  end if;

  select count(*)
    into patient_total
  from auth.users as u
  join public.profiles as profile on profile.id = u.id
  where upper(coalesce(profile.role, '')) = 'PATIENT';

  return patient_total;
end;
$function$;

revoke all on function public.admin_patient_count() from public, anon;
grant execute on function public.admin_patient_count() to authenticated;

-- Ensure PostgREST exposes the new/replaced signature immediately after the
-- migration transaction commits.
notify pgrst, 'reload schema';
