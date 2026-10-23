begin;

-- Reassert the messaging grants and participant policies from the original
-- messaging migration. RLS remains enabled; patient writes are limited to
-- their own conversation and staff writes require hospital_staff membership.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
grant select on table public.conversations to authenticated;
grant insert (patient_id) on table public.conversations to authenticated;
grant select on table public.messages to authenticated;
grant insert (conversation_id, sender_id, sender_role, message)
  on table public.messages to authenticated;

drop policy if exists "Patients and staff can read conversations" on public.conversations;
create policy "Patients and staff can read conversations"
  on public.conversations
  for select
  to authenticated
  using (
    patient_id = (select auth.uid())
    or (select public.is_hospital_staff())
  );

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
          (
            sender_role = 'patient'
            and conversations.patient_id = (select auth.uid())
          )
          or (
            sender_role = 'staff'
            and (select public.is_hospital_staff())
          )
        )
    )
  );

commit;

notify pgrst, 'reload schema';
