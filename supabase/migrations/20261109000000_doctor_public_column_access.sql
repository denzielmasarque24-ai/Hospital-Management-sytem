-- Keep public doctor cards readable while preventing anonymous access to
-- profile links, license numbers, phone numbers, and email addresses.
-- Row-level policies remain enabled and unchanged.
begin;

do $check_rls$
begin
  if not exists (
    select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'doctors'
       and c.relrowsecurity
  ) then
    raise exception 'Refusing public doctor grants: row-level security must already be enabled on public.doctors.';
  end if;
end;
$check_rls$;

-- Only demo rows are intended to be visible to anonymous visitors. The
-- restrictive policy intersects with any existing permissive anon policy.
drop policy if exists "public read demo doctor profiles" on public.doctors;
create policy "public read demo doctor profiles"
  on public.doctors for select to anon, authenticated
  using (is_demo is true);

drop policy if exists "anon restrict doctors to demo profiles" on public.doctors;
create policy "anon restrict doctors to demo profiles"
  on public.doctors as restrictive for select to anon
  using (is_demo is true);

revoke select on table public.doctors from anon, public;
revoke select (profile_id, license_number, phone, email)
  on table public.doctors from anon, public;

grant select (
  id,
  display_name,
  specialty,
  avatar_url,
  image_url,
  bio,
  experience_years,
  available,
  is_demo
) on table public.doctors to anon;

-- The admin doctor manager uses the full record shape and remains protected
-- by the existing authenticated RLS policies.
grant select on table public.doctors to authenticated;

commit;
