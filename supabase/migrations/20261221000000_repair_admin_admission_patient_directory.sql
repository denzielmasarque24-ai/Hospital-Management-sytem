begin;

-- Room Management calls this RPC with no arguments. Use the established
-- admissions authorization and the existing profiles identity columns.
create or replace function public.admin_admission_patient_directory()
returns table(patient_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_patient_area('admissions') then
    raise exception 'Admissions permission required' using errcode='42501';
  end if;

  return query
    select p.id,
      coalesce(
        nullif(btrim(to_jsonb(p)->>'full_name'),''),
        nullif(btrim(concat_ws(' ',
          to_jsonb(p)->>'first_name',
          to_jsonb(p)->>'middle_name',
          to_jsonb(p)->>'last_name',
          to_jsonb(p)->>'suffix'
        )),''),
        'Patient'
      )
    from public.profiles p
    where upper(p.role::text)='PATIENT'
    order by 2,p.id;
end;
$$;

revoke all on function public.admin_admission_patient_directory() from public,anon,authenticated;
grant execute on function public.admin_admission_patient_directory() to authenticated;

do $verify_admission_patient_directory$
declare
  v_function oid := to_regprocedure('public.admin_admission_patient_directory()');
begin
  if v_function is null then
    raise exception 'admin_admission_patient_directory() was not created';
  end if;
  if not has_function_privilege('authenticated',v_function,'EXECUTE') then
    raise exception 'authenticated role cannot execute admin_admission_patient_directory()';
  end if;
end;
$verify_admission_patient_directory$;

notify pgrst, 'reload schema';
commit;
