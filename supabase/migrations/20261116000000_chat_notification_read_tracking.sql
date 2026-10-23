begin;

-- A message can be read independently by its patient and authorized staff.
-- The existing messages.read_at column is not recipient-specific.
create table if not exists public.message_read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_read_receipts_user_idx
  on public.message_read_receipts (user_id, read_at desc);

alter table public.message_read_receipts enable row level security;
revoke all on public.message_read_receipts from anon, authenticated;
grant select, insert on public.message_read_receipts to authenticated;
grant usage on schema public to authenticated;

drop policy if exists "Chat participants read their own message receipts" on public.message_read_receipts;
create policy "Chat participants read their own message receipts"
  on public.message_read_receipts for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_id
        and m.sender_id <> (select auth.uid())
        and (
          (c.patient_id = (select auth.uid()) and upper(m.sender_role) in ('ADMIN', 'STAFF'))
          or ((select public.is_hospital_staff()) and upper(m.sender_role) = 'PATIENT')
        )
    )
  );

drop policy if exists "Chat participants mark received messages read" on public.message_read_receipts;
create policy "Chat participants mark received messages read"
  on public.message_read_receipts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_id
        and m.sender_id <> (select auth.uid())
        and (
          (c.patient_id = (select auth.uid()) and upper(m.sender_role) in ('ADMIN', 'STAFF'))
          or ((select public.is_hospital_staff()) and upper(m.sender_role) = 'PATIENT')
        )
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_read_receipts'
    ) then
      alter publication supabase_realtime add table public.message_read_receipts;
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
