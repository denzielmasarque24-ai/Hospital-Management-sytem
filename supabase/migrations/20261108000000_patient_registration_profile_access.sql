-- Allow a newly authenticated patient to create their own registration profile.
-- Existing profile rows (including staff roles) are never changed by this policy.
alter table public.profiles enable row level security;

grant select on public.profiles to authenticated;
grant insert (
  id, first_name, middle_name, last_name, suffix, gender, birthday,
  mobile_number, username, terms_accepted_at, full_name, email, phone, role
) on public.profiles to authenticated;
grant update (
  first_name, middle_name, last_name, suffix, gender, birthday,
  mobile_number, username, terms_accepted_at, full_name, email, phone
) on public.profiles to authenticated;

drop policy if exists "Patients read own registration profile" on public.profiles;
create policy "Patients read own registration profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "Patients create own registration profile" on public.profiles;
create policy "Patients create own registration profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and upper(coalesce(role, 'PATIENT')) = 'PATIENT');

drop policy if exists "Patients update own registration profile" on public.profiles;
create policy "Patients update own registration profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) and upper(coalesce(role, 'PATIENT')) = 'PATIENT')
  with check (id = (select auth.uid()) and upper(coalesce(role, 'PATIENT')) = 'PATIENT');
