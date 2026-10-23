begin;

-- Keep patient INSERT/SELECT policies intact. Only verified administrators may
-- read all appointment rows or update the supported status column.
revoke update on public.appointments from public, anon, authenticated;
revoke update (id, patient_id, doctor_id, service_id, appointment_date, appointment_time, notes, created_at, updated_at)
  on public.appointments from public, anon, authenticated;
grant update (status) on public.appointments to authenticated;
grant select on public.appointments to authenticated;
grant select (suffix) on public.profiles to authenticated;

drop policy if exists "Admins can read appointments" on public.appointments;
create policy "Admins can read appointments"
  on public.appointments for select to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));

drop policy if exists "Admins can update appointment status" on public.appointments;
create policy "Admins can update appointment status"
  on public.appointments for update to authenticated
  using (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'))
  with check (public.current_admin_role() in ('ADMIN', 'SUPER_ADMIN'));

-- The appointment table uses appointment_date / appointment_time, not the
-- legacy preferred_date / preferred_time columns referenced by the old trigger.
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
  elsif old.appointment_date is distinct from new.appointment_date
     or old.appointment_time is distinct from new.appointment_time then
    perform public.create_admin_event_notifications(
      'appointment_rescheduled', 'Appointment Rescheduled', 'An appointment request date or time changed.',
      'appointment-rescheduled:' || new.id::text || ':' || txid_current()::text, null, new.id
    );
  end if;
  return new;
end;
$$;

commit;
