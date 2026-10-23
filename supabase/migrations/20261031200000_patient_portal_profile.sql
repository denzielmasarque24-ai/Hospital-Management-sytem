-- Patient-editable contact details are kept separate from staff-controlled
-- clinical identity, admission, billing, and treatment records.
create table if not exists public.patient_portal_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  address text not null default '',
  emergency_contact text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.patient_portal_profiles enable row level security;
revoke all on public.patient_portal_profiles from anon, authenticated;
grant select on public.patient_portal_profiles to authenticated;
grant insert (user_id, full_name, phone, address, emergency_contact)
  on public.patient_portal_profiles to authenticated;
grant update (full_name, phone, address, emergency_contact)
  on public.patient_portal_profiles to authenticated;

drop policy if exists "Patients read their own portal profile" on public.patient_portal_profiles;
create policy "Patients read their own portal profile"
  on public.patient_portal_profiles for select to authenticated
  using (user_id = (select auth.uid()) and public.current_admin_role() = 'PATIENT');

drop policy if exists "Patients create their own portal profile" on public.patient_portal_profiles;
create policy "Patients create their own portal profile"
  on public.patient_portal_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and public.current_admin_role() = 'PATIENT');

drop policy if exists "Patients update their own portal profile" on public.patient_portal_profiles;
create policy "Patients update their own portal profile"
  on public.patient_portal_profiles for update to authenticated
  using (user_id = (select auth.uid()) and public.current_admin_role() = 'PATIENT')
  with check (user_id = (select auth.uid()) and public.current_admin_role() = 'PATIENT');
