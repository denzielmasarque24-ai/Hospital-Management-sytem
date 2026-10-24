begin;

-- Private dashboard notices. Notifications may only be written by trusted
-- database triggers/service role and read by the account they target.
create table if not exists public.patient_notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  event_key text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  unique(patient_id,event_key)
);
alter table public.patient_notifications enable row level security;
revoke all on public.patient_notifications from anon,authenticated;
grant select on public.patient_notifications to authenticated;
create policy "Patients read own dashboard notifications" on public.patient_notifications for select to authenticated
  using(patient_id=(select auth.uid()));

-- Older deployments created appointment_requests before the richer appointment
-- workflow. Add only the real optional links used by the existing admin UI.
alter table public.appointments add column if not exists doctor_id uuid references public.doctors(id) on delete set null;
alter table public.appointments add column if not exists service_id uuid references public.services(id) on delete set null;
alter table public.appointments add column if not exists notes text not null default '';
alter table public.appointments add column if not exists updated_at timestamptz not null default now();
alter table public.appointments add column if not exists department text not null default '';
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments add constraint appointments_status_check check(status in ('pending','confirmed','completed','cancelled'));

create or replace function public.notify_patient_dashboard_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_patient uuid;v_title text;v_body text;v_key text;v_status text;
begin
  if tg_table_name='appointments' then
    v_patient:=new.patient_id;v_status:=new.status;
    if tg_op='INSERT' then v_title:='Appointment request received';v_body:='Your appointment request is listed in My Appointments.';v_key:='appointment:'||new.id||':created';
    elsif old.status is distinct from new.status then v_title:='Appointment updated';v_body:='Your appointment status is now '||replace(new.status,'_',' ')||'.';v_key:='appointment:'||new.id||':status:'||new.status||':'||txid_current();
    elsif old.appointment_date is distinct from new.appointment_date or old.appointment_time is distinct from new.appointment_time then v_title:='Appointment rescheduled';v_body:='Your appointment schedule has been updated.';v_key:='appointment:'||new.id||':schedule:'||txid_current();
      else return new; end if;
  elsif tg_table_name='patient_admissions' then
    v_patient:=new.patient_id;
    if tg_op='INSERT' then v_title:='Admission record created';v_body:='Your admission information is available in My Admissions.';v_key:='admission:'||new.id||':created';
    elsif old.status is distinct from new.status or old.discharge_date is distinct from new.discharge_date then v_title:='Admission updated';v_body:='Your admission status is now '||replace(new.status,'_',' ')||'.';v_key:='admission:'||new.id||':status:'||new.status||':'||coalesce(new.discharge_date::text,'')||':'||txid_current();
    else return new; end if;
  elsif tg_table_name='patient_room_assignments' then
    v_patient:=new.patient_id;
    if tg_op='INSERT' then v_title:='Room assignment updated';v_body:='Your room and bed assignment is available in My Room Information.';v_key:='room:'||new.id||':assigned';
    elsif old.status is distinct from new.status then v_title:='Room assignment updated';v_body:='Your room assignment history has been updated.';v_key:='room:'||new.id||':status:'||new.status||':'||txid_current();
    else return new; end if;
  elsif tg_table_name='patient_bills' then
    v_patient:=new.patient_id;
    if new.payment_approved_at is not null and (tg_op='INSERT' or old.payment_approved_at is null) then v_title:='Hospital bill finalized';v_body:='A finalized bill is available in My Bills & Payments.';v_key:='bill:'||new.id||':finalized';
    else return new; end if;
  elsif tg_table_name='patient_payments' then
    v_patient:=new.patient_id;
    if new.is_demo is false and lower(new.status) in ('completed','paid','succeeded') and (tg_op='INSERT' or lower(coalesce(old.status,'')) not in ('completed','paid','succeeded')) then v_title:='Payment verified';v_body:='A verified payment has been applied to your bill.';v_key:='payment:'||new.id||':verified';
    else return new; end if;
  else return new;
  end if;
  insert into public.patient_notifications(patient_id,title,body,event_key) values(v_patient,v_title,v_body,v_key) on conflict(patient_id,event_key) do nothing;
  return new;
end; $$;

drop trigger if exists patient_dashboard_appointment_notice on public.appointments;
create trigger patient_dashboard_appointment_notice after insert or update on public.appointments for each row execute function public.notify_patient_dashboard_event();
drop trigger if exists patient_dashboard_admission_notice on public.patient_admissions;
create trigger patient_dashboard_admission_notice after insert or update on public.patient_admissions for each row execute function public.notify_patient_dashboard_event();
drop trigger if exists patient_dashboard_room_notice on public.patient_room_assignments;
create trigger patient_dashboard_room_notice after insert or update on public.patient_room_assignments for each row execute function public.notify_patient_dashboard_event();
drop trigger if exists patient_dashboard_bill_notice on public.patient_bills;
create trigger patient_dashboard_bill_notice after insert or update on public.patient_bills for each row execute function public.notify_patient_dashboard_event();
drop trigger if exists patient_dashboard_payment_notice on public.patient_payments;
create trigger patient_dashboard_payment_notice after insert or update on public.patient_payments for each row execute function public.notify_patient_dashboard_event();

revoke all on function public.notify_patient_dashboard_event() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
