-- Apply with database-administrator access after reviewing signup_profile_audit.sql.
-- No users or profiles are inserted, deleted, or updated by this migration.
-- Existing Auth signup trigger and RLS policies are preserved.
begin;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'Profile RLS must already be enabled. Review the audit before applying this migration.';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_proc f on f.oid = t.tgfoid
    join pg_namespace n on n.oid = f.pronamespace
    where t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_created'
      and f.proname = 'handle_new_user' and n.nspname = 'public'
      and not t.tgisinternal
  ) then
    raise exception 'Expected on_auth_user_created -> public.handle_new_user() trigger is missing.';
  end if;
end $$;

lock table public.profiles in share row exclusive mode;
do $$
begin
  if exists (
    select 1 from public.profiles
    where username is not null and btrim(username) <> ''
    group by lower(btrim(username)) having count(*) > 1
  ) then
    raise exception 'Duplicate normalized usernames exist. Review them with the administrator; no records have been changed.';
  end if;
end $$;

create unique index if not exists profiles_signup_username_normalized_key
  on public.profiles (lower(btrim(username)))
  where username is not null and btrim(username) <> '';

-- Return only availability, not profile rows or other patients' information.
create or replace function public.is_username_available(p_username text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when p_username is null or btrim(p_username) !~ '^[A-Za-z0-9_.-]{3,60}$' then false
    else not exists (
      select 1 from public.profiles p
      where lower(btrim(p.username)) = lower(btrim(p_username))
    )
  end;
$$;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Column GRANTs alone do not protect against broader table-level UPDATE grants.
-- This guard compares every stored field, with an explicit contact/identity allowlist.
-- Authorization comes from the stored role, never from user metadata.
create or replace function public.protect_registration_profile_fields()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  requester_role text;
  editable text[] := array[
    'first_name', 'middle_name', 'last_name', 'suffix', 'gender',
    'date_of_birth', 'birthday', 'mobile_number', 'username', 'phone',
    'address', 'emergency_contact', 'updated_at'
  ];
begin
  -- Trusted service/database operations are not patient-originated updates.
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
  -- updated_at, when present, is always server-controlled.
  if to_jsonb(new) ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  end if;
  return new;
end;
$$;
revoke all on function public.protect_registration_profile_fields() from public;

-- Idempotent trigger creation without removing any RLS policies or Auth triggers.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'zz_protect_registration_profile_fields' and not tgisinternal
  ) then
    create trigger zz_protect_registration_profile_fields
      before update on public.profiles for each row
      execute function public.protect_registration_profile_fields();
  end if;
end $$;

commit;
