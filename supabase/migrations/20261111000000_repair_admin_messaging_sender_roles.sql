begin;

-- Reassert staff authorization and participant SELECT policies. The admin
-- inbox has no patient_id filter; RLS grants access to staff while patients
-- remain limited to their own conversation and messages.
create or replace function public.is_hospital_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.hospital_staff
      where user_id = (select auth.uid())
    )
    or coalesce(public.current_admin_role(), '') in ('ADMIN', 'SUPER_ADMIN');
$$;

revoke all on function public.is_hospital_staff() from public;
grant execute on function public.is_hospital_staff() to authenticated;

-- The original messages constraint and the participant RLS policy use the
-- lowercase sender roles. Reassert those same secure checks after migrations
-- that introduced uppercase values, which violate the deployed table check.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

grant select on public.conversations, public.messages to authenticated;
drop policy if exists "Patients and staff can read conversations" on public.conversations;
create policy "Patients and staff can read conversations"
  on public.conversations for select to authenticated
  using (patient_id = (select auth.uid()) or (select public.is_hospital_staff()));

drop policy if exists "Conversation participants can read messages" on public.messages;
create policy "Conversation participants can read messages"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and (conversations.patient_id = (select auth.uid()) or (select public.is_hospital_staff()))
    )
  );

alter table public.conversations
  add column if not exists subject text,
  add column if not exists status text not null default 'open',
  add column if not exists updated_at timestamptz not null default now();

grant update (status) on public.conversations to authenticated;
drop policy if exists "Hospital staff can update conversation status" on public.conversations;
create policy "Hospital staff can update conversation status"
  on public.conversations
  for update
  to authenticated
  using ((select public.is_hospital_staff()))
  with check ((select public.is_hospital_staff()));

create or replace function public.touch_conversation_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_touch_updated_at on public.conversations;
create trigger conversations_touch_updated_at
  before update on public.conversations
  for each row execute function public.touch_conversation_updated_at();

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

revoke all on function public.touch_conversation_on_message() from public;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

drop policy if exists "Patients send messages" on public.messages;
drop policy if exists "Authorized staff send messages" on public.messages;
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

notify pgrst, 'reload schema';
commit;
