create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  patient_name text not null,
  email text not null,
  phone text not null,
  department text not null,
  doctor text,
  preferred_date date not null,
  preferred_time time not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

alter table public.appointments enable row level security;

revoke all on public.appointments from anon;
grant select, insert on public.appointments to authenticated;

drop policy if exists "Patients can create their own appointments" on public.appointments;
create policy "Patients can create their own appointments"
  on public.appointments for insert to authenticated
  with check (auth.uid() = patient_id);

drop policy if exists "Patients can read their own appointments" on public.appointments;
create policy "Patients can read their own appointments"
  on public.appointments for select to authenticated
  using (auth.uid() = patient_id);
