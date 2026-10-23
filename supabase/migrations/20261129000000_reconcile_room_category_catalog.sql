-- Reconcile the public room-rate catalog without touching hospital_rooms,
-- bed assignments, admissions, or patient billing records.
begin;

create table if not exists public.room_categories (
  slug text primary key,
  name text not null,
  branch text,
  nightly_rate numeric(12, 2),
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  description text,
  bed_capacity integer,
  bathroom_type text,
  room_size_sqm numeric(8, 2),
  amenities jsonb not null default '[]'::jsonb,
  image_url text,
  is_demo_rate boolean not null default false
);

alter table public.room_categories
  add column if not exists branch text,
  add column if not exists nightly_rate numeric(12, 2),
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists description text,
  add column if not exists bed_capacity integer,
  add column if not exists bathroom_type text,
  add column if not exists room_size_sqm numeric(8, 2),
  add column if not exists amenities jsonb not null default '[]'::jsonb,
  add column if not exists image_url text,
  add column if not exists is_demo_rate boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.room_categories'::regclass and conname='room_categories_nightly_rate_nonnegative') then
    alter table public.room_categories add constraint room_categories_nightly_rate_nonnegative
      check (nightly_rate is null or (nightly_rate >= 0 and nightly_rate <> 'NaN'::numeric));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.room_categories'::regclass and conname='room_categories_demo_rate_requires_amount') then
    alter table public.room_categories add constraint room_categories_demo_rate_requires_amount
      check (not is_demo_rate or nightly_rate is not null);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.room_categories'::regclass and conname='room_categories_amenities_array') then
    alter table public.room_categories add constraint room_categories_amenities_array
      check (jsonb_typeof(amenities) = 'array');
  end if;
end;
$$;

insert into public.room_categories (slug, name, branch, image_url) values
  ('premier-suite', 'Premier Suite', null, '/images/rooms/Luxury Premier Hospital Suite.png'),
  ('superior-suite', 'Superior Suite', null, '/images/rooms/Medwell Superior Suite Interior.png'),
  ('semi-suite-room', 'Semi-Suite Room', null, '/images/rooms/Modern Medwell Hospital Semi-Suite.png'),
  ('junior-suite', 'Junior Suite', null, '/images/rooms/Warm Modern Medwell Junior Suite.png'),
  ('regular-private-new', 'Regular Private New', null, '/images/rooms/Modern Sage-Toned Hospital Private Room.png'),
  ('regular-private', 'Regular Private', null, '/images/rooms/regular.png'),
  ('semi-private-building-a-b', 'Semi-Private Building A/B', null, '/images/rooms/Building A_B Semi-Private Rooms.png'),
  ('ward', 'Ward', null, '/images/rooms/Modern Hospital Ward Interior.png'),
  ('premier-suite-mandaue', 'Premier Suite – Mandaue', 'Mandaue', '/images/rooms/Luxury Premier Hospital Suite.png')
on conflict (slug) do nothing;

update public.room_categories as category
set image_url = samples.image_url
from (values
  ('premier-suite', '/images/rooms/Luxury Premier Hospital Suite.png'),
  ('superior-suite', '/images/rooms/Medwell Superior Suite Interior.png'),
  ('semi-suite-room', '/images/rooms/Modern Medwell Hospital Semi-Suite.png'),
  ('junior-suite', '/images/rooms/Warm Modern Medwell Junior Suite.png'),
  ('regular-private-new', '/images/rooms/Modern Sage-Toned Hospital Private Room.png'),
  ('regular-private', '/images/rooms/regular.png'),
  ('semi-private-building-a-b', '/images/rooms/Building A_B Semi-Private Rooms.png'),
  ('ward', '/images/rooms/Modern Hospital Ward Interior.png'),
  ('premier-suite-mandaue', '/images/rooms/Luxury Premier Hospital Suite.png')
) as samples(slug, image_url)
where category.slug = samples.slug
  and nullif(btrim(category.image_url), '') is null;

update public.room_categories as category
set nightly_rate = samples.amount,
    is_demo_rate = true,
    updated_at = now()
from (values
  ('premier-suite', 8500.00::numeric),
  ('superior-suite', 6500.00::numeric),
  ('semi-suite-room', 5000.00::numeric),
  ('junior-suite', 4000.00::numeric),
  ('regular-private-new', 3500.00::numeric),
  ('regular-private', 2800.00::numeric),
  ('semi-private-building-a-b', 1800.00::numeric),
  ('ward', 900.00::numeric),
  ('premier-suite-mandaue', 9000.00::numeric)
) as samples(slug, amount)
where category.slug = samples.slug
  and (category.nightly_rate is null or category.is_demo_rate is true);

alter table public.room_categories enable row level security;
revoke all on public.room_categories from public, anon, authenticated;
grant select on public.room_categories to anon, authenticated;
grant update (nightly_rate, is_demo_rate, description, bed_capacity, bathroom_type, room_size_sqm, amenities, updated_at, updated_by)
  on public.room_categories to authenticated;

drop policy if exists "Public can view active room categories" on public.room_categories;
create policy "Public can view active room categories"
  on public.room_categories for select to anon, authenticated
  using (is_active is true);

drop policy if exists "Administrators update room category rates" on public.room_categories;
create policy "Administrators update room category rates"
  on public.room_categories for update to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));

commit;

notify pgrst, 'reload schema';
