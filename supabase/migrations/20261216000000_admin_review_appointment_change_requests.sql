begin;

create or replace function public.admin_review_appointment_change_request(
  p_request_id uuid,
  p_decision text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.patient_appointment_change_requests%rowtype;
  v_appointment public.appointments%rowtype;
begin
  if auth.uid() is null or coalesce(public.current_admin_role(),'') not in ('ADMIN','SUPER_ADMIN') then
    raise exception 'Appointment management permission required' using errcode='42501';
  end if;
  if p_request_id is null or p_decision is null or p_decision not in ('approved','declined') then
    raise exception 'A request and approved or declined decision are required' using errcode='22023';
  end if;

  select * into v_request
  from public.patient_appointment_change_requests
  where id=p_request_id and status='pending'
  for update;
  if not found then
    raise exception 'This appointment change request is no longer pending' using errcode='55000';
  end if;

  select * into v_appointment
  from public.appointments
  where id=v_request.appointment_id and patient_id=v_request.patient_id
  for update;
  if not found then
    raise exception 'The related patient appointment could not be found' using errcode='P0002';
  end if;

  if p_decision='approved' then
    if v_request.request_type='reschedule' then
      if v_request.requested_date is null or v_request.requested_time is null
        or v_request.requested_date < (now() at time zone 'Asia/Manila')::date then
        raise exception 'The requested appointment date or time is invalid or in the past' using errcode='22023';
      end if;
      if v_appointment.status in ('cancelled','completed') then
        raise exception 'A cancelled or completed appointment cannot be rescheduled' using errcode='55000';
      end if;
      update public.appointments
      set appointment_date=v_request.requested_date,appointment_time=v_request.requested_time
      where id=v_appointment.id;
    elsif v_request.request_type='cancellation' then
      if v_appointment.status in ('cancelled','completed') then
        raise exception 'A cancelled or completed appointment cannot be cancelled again' using errcode='55000';
      end if;
      update public.appointments set status='cancelled' where id=v_appointment.id;
    else
      raise exception 'Unsupported appointment change request type' using errcode='22023';
    end if;
  end if;

  update public.patient_appointment_change_requests
  set status=p_decision
  where id=v_request.id and status='pending';

  return jsonb_build_object(
    'request_id',v_request.id,
    'appointment_id',v_appointment.id,
    'decision',p_decision,
    'request_type',v_request.request_type
  );
end;
$$;

revoke all on function public.admin_review_appointment_change_request(uuid,text) from public,anon;
grant execute on function public.admin_review_appointment_change_request(uuid,text) to authenticated;
comment on function public.admin_review_appointment_change_request(uuid,text) is
  'Atomically reviews a pending patient change request and applies an approved reschedule or cancellation after checking the authenticated administrator role.';

notify pgrst,'reload schema';
commit;
