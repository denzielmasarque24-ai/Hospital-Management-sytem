-- Admin-managed doctor directory profiles. No private applicant data is stored here.
create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  specialization text not null,
  license_number text not null unique,
  email text not null unique,
  phone text not null,
  address text not null default '',
  availability_schedule text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists doctors_specialization_idx on public.doctors(specialization);
create index if not exists doctors_name_idx on public.doctors(last_name, first_name);

drop trigger if exists doctors_updated_at on public.doctors;
create trigger doctors_updated_at before update on public.doctors
  for each row execute function public.set_managed_content_updated_at();

alter table public.doctors enable row level security;
drop policy if exists "admins manage doctors" on public.doctors;
create policy "admins manage doctors" on public.doctors for all to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
grant select, insert, update, delete on public.doctors to authenticated;
