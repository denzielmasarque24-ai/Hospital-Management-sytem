begin;

-- The deployed room catalog uses daily_rate. Keep updates column-scoped and
-- behind the existing administrator-only row policy.
alter table public.room_categories enable row level security;
grant select on public.room_categories to authenticated;

do $$
declare
  has_daily_rate boolean;
  has_nightly_rate boolean;
  has_demo_rate boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'room_categories' and column_name = 'daily_rate'
  ) into has_daily_rate;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'room_categories' and column_name = 'nightly_rate'
  ) into has_nightly_rate;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'room_categories' and column_name = 'is_demo_rate'
  ) into has_demo_rate;

  if has_daily_rate and has_demo_rate then
    execute 'grant update (daily_rate, is_demo_rate) on public.room_categories to authenticated';
  elsif has_nightly_rate and has_demo_rate then
    -- Preserve compatibility with installations still using the original
    -- migration column name.
    execute 'grant update (nightly_rate, is_demo_rate) on public.room_categories to authenticated';
  else
    raise exception 'Room category rate and demo-rate columns are unavailable.';
  end if;
end;
$$;

drop policy if exists "Administrators update room category rates" on public.room_categories;
create policy "Administrators update room category rates"
  on public.room_categories for update to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));

drop policy if exists "Administrators view all room categories" on public.room_categories;
create policy "Administrators view all room categories"
  on public.room_categories for select to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));

notify pgrst, 'reload schema';
commit;
