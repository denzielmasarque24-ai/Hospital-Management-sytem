begin;

create table if not exists public.hospital_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.hospital_staff enable row level security;
revoke all on table public.hospital_staff from anon, authenticated;

create or replace function public.is_hospital_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hospital_staff
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_hospital_staff() from public;
grant execute on function public.is_hospital_staff() to authenticated;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_role text not null check (sender_role in ('patient', 'staff')),
  message text not null check (char_length(btrim(message)) between 1 and 10000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
grant select on table public.conversations to authenticated;
grant insert (patient_id) on table public.conversations to authenticated;
grant select on table public.messages to authenticated;
grant insert (conversation_id, sender_id, sender_role, message) on table public.messages to authenticated;

drop policy if exists "Patients and staff can read conversations" on public.conversations;
create policy "Patients and staff can read conversations"
  on public.conversations
  for select
  to authenticated
  using (patient_id = (select auth.uid()) or (select public.is_hospital_staff()));

drop policy if exists "Patients can create their own conversation" on public.conversations;
create policy "Patients can create their own conversation"
  on public.conversations
  for insert
  to authenticated
  with check (patient_id = (select auth.uid()));

drop policy if exists "Conversation participants can read messages" on public.messages;
create policy "Conversation participants can read messages"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.conversations
      where conversations.id = messages.conversation_id
        and (
          conversations.patient_id = (select auth.uid())
          or (select public.is_hospital_staff())
        )
    )
  );

drop policy if exists "Patients and authorized staff can send messages" on public.messages;
create policy "Patients and authorized staff can send messages"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1
      from public.conversations
      where conversations.id = messages.conversation_id
        and (
          (sender_role = 'patient' and conversations.patient_id = (select auth.uid()))
          or (sender_role = 'staff' and (select public.is_hospital_staff()))
        )
    )
  );

commit;