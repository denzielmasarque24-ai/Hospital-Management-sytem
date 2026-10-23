begin;

-- Ensure the message role check accepts the existing PATIENT rows and the
-- ADMIN role used by authenticated administrator replies.
do $$
declare
  check_row record;
begin
  for check_row in
    select conname
    from pg_constraint
    where conrelid = 'public.messages'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%sender_role%'
  loop
    execute format('alter table public.messages drop constraint %I', check_row.conname);
  end loop;
end;
$$;

alter table public.messages
  add constraint messages_sender_role_check
  check (upper(sender_role) in ('PATIENT', 'ADMIN', 'STAFF'));

grant select on public.conversations, public.messages to authenticated;
grant insert (conversation_id, sender_id, sender_role, message) on public.messages to authenticated;
grant select (id, first_name, middle_name, last_name, email) on public.profiles to authenticated;

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

drop policy if exists "Patients and authorized staff can send messages" on public.messages;
drop policy if exists "Patients send messages" on public.messages;
drop policy if exists "Authorized staff send messages" on public.messages;
create policy "Patients and authorized staff can send messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and (
          (upper(sender_role) = 'PATIENT' and conversations.patient_id = (select auth.uid()))
          or (upper(sender_role) in ('ADMIN', 'STAFF') and (select public.is_hospital_staff()))
        )
    )
  );

drop policy if exists "Hospital staff can read patient profiles" on public.profiles;
create policy "Hospital staff can read patient profiles"
  on public.profiles for select to authenticated
  using ((select public.is_hospital_staff()));

notify pgrst, 'reload schema';
commit;
