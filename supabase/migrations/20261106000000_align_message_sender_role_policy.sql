begin;

-- The deployed patient policy expects the exact enum-like text value PATIENT.
-- Recreate it with both authenticated sender identity and conversation
-- ownership checks, and keep staff authorization separate.
drop policy if exists "Patients send messages" on public.messages;
drop policy if exists "Patients and authorized staff can send messages" on public.messages;
drop policy if exists "Authorized staff send messages" on public.messages;

create policy "Patients send messages"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'PATIENT'
    and exists (
      select 1
      from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.patient_id = (select auth.uid())
        and conversations.status = 'open'
    )
  );

create policy "Authorized staff send messages"
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'STAFF'
    and (select public.is_hospital_staff())
    and exists (
      select 1
      from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.status = 'open'
    )
  );

commit;
