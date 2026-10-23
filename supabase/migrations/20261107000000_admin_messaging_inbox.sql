begin;

-- Message-center staff access follows the existing hospital_staff membership
-- and the elevated roles already recognized by the Admin Dashboard.
create or replace function public.is_hospital_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.hospital_staff
      where user_id = (select auth.uid())
    )
    or coalesce(public.current_admin_role(), '') in ('ADMIN', 'SUPER_ADMIN');
$$;

revoke all on function public.is_hospital_staff() from public;
grant execute on function public.is_hospital_staff() to authenticated;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
grant select on public.conversations, public.messages to authenticated;

drop policy if exists "Patients and staff can read conversations" on public.conversations;
create policy "Patients and staff can read conversations"
  on public.conversations
  for select
  to authenticated
  using (
    patient_id = (select auth.uid())
    or (select public.is_hospital_staff())
  );

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

-- These SELECT policies grant the inbox only to the existing hospital_staff
-- membership or elevated admin roles. Patients remain limited to their own rows.
notify pgrst, 'reload schema';

commit;
