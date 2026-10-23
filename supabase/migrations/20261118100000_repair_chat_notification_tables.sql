begin;

-- Safe to apply even when one or both notification tables already exist.
-- These definitions match the tables used by the existing frontend migrations.
create table if not exists public.message_read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_read_receipts_user_idx
  on public.message_read_receipts (user_id, read_at desc);

alter table public.message_read_receipts enable row level security;
revoke all on public.message_read_receipts from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert on public.message_read_receipts to authenticated;

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

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('new_conversation', 'patient_message', 'appointment_request', 'appointment_cancelled', 'appointment_rescheduled', 'new_order')),
  title text not null,
  body text not null,
  related_conversation_id uuid references public.conversations(id) on delete cascade,
  event_key text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_key)
);

create index if not exists admin_notifications_recipient_created_idx
  on public.admin_notifications (recipient_id, created_at desc);
create index if not exists admin_notifications_unread_idx
  on public.admin_notifications (recipient_id, is_read, created_at desc);

alter table public.admin_notifications enable row level security;
revoke all on public.admin_notifications from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.admin_notifications to authenticated;
grant update (is_read) on public.admin_notifications to authenticated;

drop policy if exists "Administrators read own notifications" on public.admin_notifications;
create policy "Administrators read own notifications"
  on public.admin_notifications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and (select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN')
  );

drop policy if exists "Administrators mark own notifications read" on public.admin_notifications;
create policy "Administrators mark own notifications read"
  on public.admin_notifications for update to authenticated
  using (
    recipient_id = (select auth.uid())
    and (select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN')
  )
  with check (
    recipient_id = (select auth.uid())
    and (select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN')
    and is_read
  );

-- Trigger-only creation path: callers in the browser cannot invoke this function.
-- The unique recipient/event key makes retries and trigger recreation idempotent.
create or replace function public.create_admin_event_notifications(
  p_type text,
  p_title text,
  p_body text,
  p_event_key text,
  p_conversation_id uuid default null,
  p_record_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_notifications (
    recipient_id, type, title, body, related_conversation_id, event_key
  )
  select profile.id, p_type, p_title, p_body, p_conversation_id, p_event_key
  from public.profiles as profile
  where upper(coalesce(profile.role, '')) in ('ADMIN', 'SUPER_ADMIN')
  on conflict (recipient_id, event_key) do nothing;
end;
$$;

revoke all on function public.create_admin_event_notifications(text, text, text, text, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.notify_admins_patient_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if upper(new.sender_role) <> 'PATIENT' then
    return new;
  end if;

  select conversation.patient_id
    into owner_id
    from public.conversations as conversation
    where conversation.id = new.conversation_id;

  if new.sender_id = owner_id then
    perform public.create_admin_event_notifications(
      'patient_message',
      'New Patient Message',
      'A patient sent a message. Open the conversation to review it.',
      'message:' || new.id::text,
      new.conversation_id,
      new.id
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_admins_patient_message() from public, anon, authenticated;
drop trigger if exists admin_notify_patient_message on public.messages;
create trigger admin_notify_patient_message
  after insert on public.messages
  for each row execute function public.notify_admins_patient_message();

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
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_notifications'
    ) then
      alter publication supabase_realtime add table public.admin_notifications;
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
