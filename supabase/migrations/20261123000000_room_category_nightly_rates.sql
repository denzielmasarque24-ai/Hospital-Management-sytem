-- There is no room_categories table in the current schema. Keep category-level
-- pricing separate from physical patient_rooms and admission assignments.
begin;

create table if not exists public.room_categories (
  slug text primary key,
  name text not null,
  branch text,
  nightly_rate numeric(12, 2),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint room_categories_nightly_rate_nonnegative check (nightly_rate is null or (nightly_rate >= 0 and nightly_rate <> 'NaN'::numeric))
);

alter table public.room_categories
  add column if not exists nightly_rate numeric(12, 2),
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.room_categories'::regclass
      and conname = 'room_categories_nightly_rate_nonnegative'
  ) then
    alter table public.room_categories
      add constraint room_categories_nightly_rate_nonnegative
      check (nightly_rate is null or (nightly_rate >= 0 and nightly_rate <> 'NaN'::numeric));
  end if;
end;
$$;

insert into public.room_categories (slug, name, branch) values
  ('premier-suite', 'Premier Suite', null),
  ('superior-suite', 'Superior Suite', null),
  ('semi-suite-room', 'Semi-Suite Room', null),
  ('junior-suite', 'Junior Suite', null),
  ('regular-private-new', 'Regular Private New', null),
  ('regular-private', 'Regular Private', null),
  ('semi-private-building-a-b', 'Semi-Private Building A/B', null),
  ('ward', 'Ward', null),
  ('premier-suite-mandaue', 'Premier Suite – Mandaue', 'Mandaue')
on conflict (slug) do nothing;

alter table public.room_categories enable row level security;
revoke all on public.room_categories from public, anon, authenticated;
grant select on public.room_categories to anon, authenticated;
grant update (nightly_rate, updated_at, updated_by) on public.room_categories to authenticated;

drop policy if exists "Public can view active room categories" on public.room_categories;
create policy "Public can view active room categories"
  on public.room_categories for select to anon, authenticated
  using (is_active = true);

drop policy if exists "Administrators update room category rates" on public.room_categories;
create policy "Administrators update room category rates"
  on public.room_categories for update to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));

commit;
