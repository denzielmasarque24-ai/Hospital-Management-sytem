begin;

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
revoke all on public.admin_notifications from anon, authenticated;
grant select on public.admin_notifications to authenticated;
grant update (is_read) on public.admin_notifications to authenticated;

drop policy if exists "Administrators read own notifications" on public.admin_notifications;
create policy "Administrators read own notifications"
  on public.admin_notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and (select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'));

drop policy if exists "Administrators mark own notifications read" on public.admin_notifications;
create policy "Administrators mark own notifications read"
  on public.admin_notifications for update to authenticated
  using (recipient_id = (select auth.uid()) and (select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN'))
  with check (recipient_id = (select auth.uid()) and (select public.current_admin_role()) in ('ADMIN', 'SUPER_ADMIN') and is_read);

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

revoke all on function public.create_admin_event_notifications(text, text, text, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.notify_admins_new_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.patient_id = (select auth.uid()) then
    perform public.create_admin_event_notifications(
      'new_conversation', 'New Patient Conversation', 'A patient started a new conversation. Open Messages to review it.',
      'conversation:' || new.id::text, new.id, new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_admins_patient_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  if upper(new.sender_role) <> 'PATIENT' then return new; end if;
  select patient_id into owner_id from public.conversations where id = new.conversation_id;
  if new.sender_id = owner_id then
    perform public.create_admin_event_notifications(
      'patient_message', 'New Patient Message', 'A patient sent a message. Open the conversation to review it.',
      'message:' || new.id::text, new.conversation_id, new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_admins_appointment_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.patient_id = (select auth.uid()) then
      perform public.create_admin_event_notifications(
        'appointment_request', 'New Appointment Request', 'A patient submitted an appointment request.',
        'appointment-request:' || new.id::text, null, new.id
      );
    end if;
  elsif new.status = 'cancelled' and old.status is distinct from new.status then
    perform public.create_admin_event_notifications(
      'appointment_cancelled', 'Appointment Cancelled', 'An appointment request was cancelled.',
      'appointment-cancelled:' || new.id::text || ':' || txid_current()::text, null, new.id
    );
  elsif old.preferred_date is distinct from new.preferred_date or old.preferred_time is distinct from new.preferred_time then
    perform public.create_admin_event_notifications(
      'appointment_rescheduled', 'Appointment Rescheduled', 'An appointment request date or time changed.',
      'appointment-rescheduled:' || new.id::text || ':' || txid_current()::text, null, new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_admins_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_admin_event_notifications(
    'new_order', 'New Order Submitted', 'A new order was submitted for review.',
    'order:' || new.id::text, null, new.id
  );
  return new;
end;
$$;

drop trigger if exists admin_notify_new_conversation on public.conversations;
create trigger admin_notify_new_conversation after insert on public.conversations
  for each row execute function public.notify_admins_new_conversation();
drop trigger if exists admin_notify_patient_message on public.messages;
create trigger admin_notify_patient_message after insert on public.messages
  for each row execute function public.notify_admins_patient_message();
drop trigger if exists admin_notify_appointment_event on public.appointments;
create trigger admin_notify_appointment_event after insert or update on public.appointments
  for each row execute function public.notify_admins_appointment_event();
drop trigger if exists admin_notify_new_order on public.orders;
create trigger admin_notify_new_order after insert on public.orders
  for each row execute function public.notify_admins_new_order();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'admin_notifications'
     ) then
    alter publication supabase_realtime add table public.admin_notifications;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
