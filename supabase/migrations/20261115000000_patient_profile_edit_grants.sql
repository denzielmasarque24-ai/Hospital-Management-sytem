-- Ensure authenticated patients can update only the editable profile columns.
-- Row access remains controlled by the existing Patients update own registration profile policy.
begin;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (
  first_name,
  middle_name,
  last_name,
  suffix,
  gender,
  date_of_birth,
  mobile_number,
  username
) on public.profiles to authenticated;

notify pgrst, 'reload schema';
commit;
