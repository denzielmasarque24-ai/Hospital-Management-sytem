begin;

-- Patient editable profile fields; role, id, and authentication fields remain
-- protected by the existing registration-profile guard trigger.
grant update (date_of_birth, avatar_url) on public.profiles to authenticated;

create or replace function public.protect_registration_profile_fields()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  requester_role text;
  editable text[] := array[
    'first_name', 'middle_name', 'last_name', 'suffix', 'gender',
    'date_of_birth', 'birthday', 'mobile_number', 'username', 'phone',
    'address', 'emergency_contact', 'avatar_url', 'updated_at'
  ];
begin
  if auth.role() = 'service_role' then return new; end if;
  if auth.uid() is null then
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'An authenticated patient identity is required.' using errcode = '42501';
    end if;
    return new;
  end if;
  select upper(p.role::text) into requester_role from public.profiles p where p.id = auth.uid();
  if requester_role in ('ADMIN', 'SUPER_ADMIN') then return new; end if;
  if old.id <> auth.uid() then
    raise exception 'You may only update your own patient profile.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - editable) is distinct from (to_jsonb(old) - editable) then
    raise exception 'Privileged profile fields cannot be changed by this account.' using errcode = '42501';
  end if;
  if to_jsonb(new) ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  end if;
  return new;
end;
$$;
revoke all on function public.protect_registration_profile_fields() from public;

create table if not exists public.patient_appointment_change_requests (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in ('reschedule', 'cancellation')),
  requested_date date,
  requested_time time,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  check ((request_type = 'reschedule' and requested_date is not null and requested_time is not null) or request_type = 'cancellation')
);
create index if not exists patient_appointment_change_requests_patient_idx on public.patient_appointment_change_requests(patient_id, created_at desc);
alter table public.patient_appointment_change_requests enable row level security;
revoke all on public.patient_appointment_change_requests from anon, authenticated;
grant select on public.patient_appointment_change_requests to authenticated;
grant insert (appointment_id, patient_id, request_type, requested_date, requested_time, reason) on public.patient_appointment_change_requests to authenticated;
grant update (status) on public.patient_appointment_change_requests to authenticated;
create policy "Patients read own appointment change requests" on public.patient_appointment_change_requests for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "Patients request changes to own appointments" on public.patient_appointment_change_requests for insert to authenticated
  with check (patient_id = (select auth.uid()) and exists (select 1 from public.appointments a where a.id = appointment_id and a.patient_id = (select auth.uid())));
create policy "Administrators read appointment change requests" on public.patient_appointment_change_requests for select to authenticated
  using ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'));
create policy "Administrators update appointment change requests" on public.patient_appointment_change_requests for update to authenticated
  using ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'))
  with check ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'));

create table if not exists public.patient_doctor_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  department text not null default '',
  consultation_type text not null default '',
  assigned_at timestamptz not null default now(),
  active boolean not null default true
);
create index if not exists patient_doctor_assignments_patient_idx on public.patient_doctor_assignments(patient_id, active, assigned_at desc);
alter table public.patient_doctor_assignments enable row level security;
grant select on public.patient_doctor_assignments to authenticated;
grant insert, update, delete on public.patient_doctor_assignments to authenticated;
create policy "Patients read own doctor assignments" on public.patient_doctor_assignments for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "Administrators manage doctor assignments" on public.patient_doctor_assignments for all to authenticated
  using ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'))
  with check ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'));

create table if not exists public.patient_admissions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  admission_number text not null unique,
  status text not null check (status in ('admitted', 'discharged', 'cancelled')),
  admission_date date not null default current_date,
  discharge_date date,
  doctor_id uuid references public.doctors(id) on delete set null,
  department text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (id, patient_id)
);
create index if not exists patient_admissions_patient_idx on public.patient_admissions(patient_id, admission_date desc);
alter table public.patient_admissions enable row level security;
grant select, insert, update, delete on public.patient_admissions to authenticated;
create policy "Patients read own admissions" on public.patient_admissions for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "Administrators manage admissions" on public.patient_admissions for all to authenticated
  using ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'))
  with check ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'));

create table if not exists public.patient_room_assignments (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null references public.patient_admissions(id) on delete cascade,
  patient_id uuid not null references auth.users(id) on delete cascade,
  room_number text not null,
  bed_number text not null default '',
  room_type text not null default '',
  floor_or_ward text not null default '',
  status text not null default 'assigned' check (status in ('assigned', 'released')),
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  foreign key (admission_id, patient_id) references public.patient_admissions(id, patient_id)
);
create index if not exists patient_room_assignments_patient_idx on public.patient_room_assignments(patient_id, status, assigned_at desc);
alter table public.patient_room_assignments enable row level security;
grant select, insert, update, delete on public.patient_room_assignments to authenticated;
create policy "Patients read own room assignments" on public.patient_room_assignments for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "Administrators manage room assignments" on public.patient_room_assignments for all to authenticated
  using ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'))
  with check ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'));

create table if not exists public.patient_bills (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  admission_id uuid references public.patient_admissions(id) on delete set null,
  bill_number text not null unique,
  description text not null default '',
  issued_at timestamptz not null default now(),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  receipt_url text,
  unique (id, patient_id),
  foreign key (admission_id, patient_id) references public.patient_admissions(id, patient_id)
);
create index if not exists patient_bills_patient_idx on public.patient_bills(patient_id, issued_at desc);
alter table public.patient_bills enable row level security;
grant select, insert, update, delete on public.patient_bills to authenticated;
create policy "Patients read own bills" on public.patient_bills for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "Administrators manage bills" on public.patient_bills for all to authenticated
  using ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'))
  with check ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'));

create table if not exists public.patient_payments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null references public.patient_bills(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  payment_method text not null default '',
  receipt_url text,
  foreign key (bill_id, patient_id) references public.patient_bills(id, patient_id)
);
create index if not exists patient_payments_patient_idx on public.patient_payments(patient_id, paid_at desc);
alter table public.patient_payments enable row level security;
grant select, insert, update, delete on public.patient_payments to authenticated;
create policy "Patients read own payments" on public.patient_payments for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "Administrators manage payments" on public.patient_payments for all to authenticated
  using ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'))
  with check ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'));

create table if not exists public.patient_medical_charges (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  admission_id uuid references public.patient_admissions(id) on delete set null,
  bill_id uuid references public.patient_bills(id) on delete set null,
  item_name text not null,
  category text not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  total_amount numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  charged_at timestamptz not null default now(),
  foreign key (admission_id, patient_id) references public.patient_admissions(id, patient_id),
  foreign key (bill_id, patient_id) references public.patient_bills(id, patient_id)
);
create index if not exists patient_medical_charges_patient_idx on public.patient_medical_charges(patient_id, charged_at desc);
alter table public.patient_medical_charges enable row level security;
grant select, insert, update, delete on public.patient_medical_charges to authenticated;
create policy "Patients read own medical charges" on public.patient_medical_charges for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "Administrators manage medical charges" on public.patient_medical_charges for all to authenticated
  using ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'))
  with check ((select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'));

commit;
