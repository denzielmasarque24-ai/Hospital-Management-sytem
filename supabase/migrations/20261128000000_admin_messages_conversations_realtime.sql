-- The admin inbox subscribes to conversation status and updated_at changes.
-- Keep this optional for local databases where Supabase Realtime is disabled.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'conversations'
     ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;
