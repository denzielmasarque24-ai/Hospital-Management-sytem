-- Managed public content. Career records contain job postings only, never applicant submissions.
create table if not exists public.careers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text not null default '',
  location text not null default '',
  employment_type text not null default 'Full-time',
  salary_range text,
  description text not null default '',
  qualifications text not null default '',
  application_instructions text not null default '',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  image_url text,
  display_order integer not null default 0 check (display_order >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists careers_published_created_idx on public.careers(is_published, created_at desc);
create index if not exists services_published_order_idx on public.services(is_published, display_order, name);

create or replace function public.set_managed_content_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists careers_updated_at on public.careers;
create trigger careers_updated_at before update on public.careers for each row execute function public.set_managed_content_updated_at();
drop trigger if exists services_updated_at on public.services;
create trigger services_updated_at before update on public.services for each row execute function public.set_managed_content_updated_at();

alter table public.careers enable row level security;
alter table public.services enable row level security;
drop policy if exists "public read published careers" on public.careers;
create policy "public read published careers" on public.careers for select to anon, authenticated using (is_published);
drop policy if exists "admins manage careers" on public.careers;
create policy "admins manage careers" on public.careers for all to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
drop policy if exists "public read published services" on public.services;
create policy "public read published services" on public.services for select to anon, authenticated using (is_published);
drop policy if exists "admins manage services" on public.services;
create policy "admins manage services" on public.services for all to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));
grant select on public.careers, public.services to anon, authenticated;
grant insert, update, delete on public.careers, public.services to authenticated;

-- Preserve the existing public Services page content on first migration application.
insert into public.services (name, slug, description, image_url, display_order, is_published) values
('Pharmacy', 'pharmacy', 'Convenient access to prescribed and wellness medicines at affordable prices.', 'https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&w=700&q=80', 1, true),
('Cardiology', 'cardiology', 'Advanced heart screening, treatment planning, and preventive cardiac care.', 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&w=700&q=80', 2, true),
('Neurology', 'neurology', 'Expert evaluation and management for neurological conditions and recovery.', 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?auto=format&fit=crop&w=700&q=80', 3, true),
('Pathology Lab', 'pathology-lab', 'Reliable diagnostics and sample analysis with precise reporting.', 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=700&q=80', 4, true),
('Pediatrics', 'pediatrics', 'Child-focused care with compassionate clinicians and family guidance.', 'https://images.unsplash.com/photo-1632053001145-9d3d4d4a0b8d?auto=format&fit=crop&w=700&q=80', 5, true),
('Emergency Care', 'emergency-care', 'Rapid, expert response for urgent medical needs and critical support.', 'https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=700&q=80', 6, true),
('General Medicine', 'general-medicine', 'Comprehensive ongoing health management for everyday wellbeing.', 'https://images.unsplash.com/photo-1538108149393-fbbd81895977?auto=format&fit=crop&w=700&q=80', 7, true),
('Diagnostics', 'diagnostics', 'Accurate scans, tests, and results that support confident decisions.', 'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?auto=format&fit=crop&w=700&q=80', 8, true),
('Preventive Healthcare', 'preventive-healthcare', 'Checkups and screenings designed to prevent disease before it starts.', 'https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=700&q=80', 9, true),
('Specialist Consultation', 'specialist-consultation', 'Tailored consultations with experienced professionals across specialties.', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=700&q=80', 10, true)
on conflict (slug) do nothing;
