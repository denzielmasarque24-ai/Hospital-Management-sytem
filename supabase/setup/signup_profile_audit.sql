-- Read-only: run in Supabase SQL Editor with database-administrator access.
-- Keep the function definition private; do not post patient data or credentials.
select t.tgname, pg_get_triggerdef(t.oid) as definition,
       n.nspname as function_schema, p.proname as function_name
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_created';

select pg_get_functiondef('public.handle_new_user()'::regprocedure) as signup_function;
-- Confirm it consumes first_name, middle_name, last_name, suffix, gender,
-- date_of_birth, mobile_number, username, terms_accepted, creates exactly one
-- profile, uses a server-controlled PATIENT role, and ignores metadata role/status.

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' order by ordinal_position;

select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass;
select policyname, roles, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'profiles';
select grantee, privilege_type from information_schema.table_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('PUBLIC', 'anon', 'authenticated');
select grantee, column_name, privilege_type from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('PUBLIC', 'anon', 'authenticated');
select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'profiles';
select tgname, pg_get_triggerdef(oid) from pg_trigger
where tgrelid = 'public.profiles'::regclass and not tgisinternal;

-- Aggregate only: do not expose usernames while auditing uniqueness.
select count(*) as duplicate_username_groups from (
  select 1 from public.profiles where username is not null and btrim(username) <> ''
  group by lower(btrim(username)) having count(*) > 1
) duplicates;
