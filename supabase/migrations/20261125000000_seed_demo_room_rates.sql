-- Seed sample-only prices where no rate currently exists. Existing non-NULL
-- rates are presumed approved and are never overwritten by this migration.
begin;

alter table public.room_categories
  add column if not exists is_demo_rate boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.room_categories'::regclass
      and conname = 'room_categories_demo_rate_requires_amount'
  ) then
    alter table public.room_categories
      add constraint room_categories_demo_rate_requires_amount
      check (not is_demo_rate or nightly_rate is not null);
  end if;
end;
$$;

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
  and category.nightly_rate is null;

grant update (nightly_rate, is_demo_rate, description, bed_capacity, bathroom_type, room_size_sqm, amenities, updated_at, updated_by)
  on public.room_categories to authenticated;

commit;
