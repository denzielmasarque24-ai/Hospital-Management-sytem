-- Add category specifications to the category-level catalog. All descriptive
-- facts remain NULL/empty until an authorized administrator verifies them.
begin;

alter table public.room_categories
  add column if not exists description text,
  add column if not exists bed_capacity integer,
  add column if not exists bathroom_type text,
  add column if not exists room_size_sqm numeric(8, 2),
  add column if not exists amenities jsonb not null default '[]'::jsonb,
  add column if not exists image_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.room_categories'::regclass and conname = 'room_categories_bed_capacity_positive') then
    alter table public.room_categories add constraint room_categories_bed_capacity_positive
      check (bed_capacity is null or bed_capacity > 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.room_categories'::regclass and conname = 'room_categories_bathroom_type_valid') then
    alter table public.room_categories add constraint room_categories_bathroom_type_valid
      check (bathroom_type is null or bathroom_type in ('private', 'shared'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.room_categories'::regclass and conname = 'room_categories_room_size_nonnegative') then
    alter table public.room_categories add constraint room_categories_room_size_nonnegative
      check (room_size_sqm is null or (room_size_sqm >= 0 and room_size_sqm <> 'NaN'::numeric));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.room_categories'::regclass and conname = 'room_categories_amenities_array') then
    alter table public.room_categories add constraint room_categories_amenities_array
      check (jsonb_typeof(amenities) = 'array');
  end if;
end;
$$;

-- Preserve any existing URLs. Supply the verified local photo paths for rows
-- whose image URL is still blank; no room or admission inventory is changed.
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
on conflict (slug) do update
set image_url = excluded.image_url
where nullif(btrim(public.room_categories.image_url), '') is null;

grant update (nightly_rate, description, bed_capacity, bathroom_type, room_size_sqm, amenities, updated_at, updated_by)
  on public.room_categories to authenticated;

commit;
