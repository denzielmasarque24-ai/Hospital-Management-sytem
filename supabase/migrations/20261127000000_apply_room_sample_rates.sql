-- Apply sample room rates by stable category slug. Only blank or already-demo
-- rates are changed; rates marked official remain untouched.
begin;

do $$
declare
  v_missing text[];
begin
  select array_agg(samples.slug order by samples.slug)
  into v_missing
  from (values
    ('premier-suite'),
    ('superior-suite'),
    ('semi-suite-room'),
    ('junior-suite'),
    ('regular-private-new'),
    ('regular-private'),
    ('semi-private-building-a-b'),
    ('ward'),
    ('premier-suite-mandaue')
  ) as samples(slug)
  left join public.room_categories category on category.slug = samples.slug
  where category.slug is null;

  if v_missing is not null then
    raise exception 'Missing room categories for sample rate assignment: %', array_to_string(v_missing, ', ');
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
  and (category.nightly_rate is null or category.is_demo_rate is true);

do $$
declare
  v_official text[];
begin
  select array_agg(category.slug order by category.slug)
  into v_official
  from public.room_categories category
  join (values
    ('premier-suite'),
    ('superior-suite'),
    ('semi-suite-room'),
    ('junior-suite'),
    ('regular-private-new'),
    ('regular-private'),
    ('semi-private-building-a-b'),
    ('ward'),
    ('premier-suite-mandaue')
  ) as samples(slug) on samples.slug = category.slug
  where category.nightly_rate is not null
    and category.is_demo_rate is false;

  if v_official is not null then
    raise notice 'Preserved existing official room rates for: %', array_to_string(v_official, ', ');
  end if;
end;
$$;

commit;
