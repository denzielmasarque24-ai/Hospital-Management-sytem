begin;

-- Additive: legacy rows retain their original content and demo flags.
alter table public.patient_medical_records
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists record_date date default current_date,
  add column if not exists result_status text default 'draft',
  add column if not exists is_demo boolean default false,
  add column if not exists demo_key text,
  add column if not exists delivery_state text not null default 'legacy' check(delivery_state in ('legacy','draft','reviewed','released')),
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists released_by uuid references auth.users(id),
  add column if not exists released_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- Legacy patient_lab_orders is intentionally untouched. This table delivers
-- reports against the verified lab_test_bookings/lab_tests model.
create table if not exists public.patient_lab_results (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  lab_test_booking_id uuid references public.lab_test_bookings(id),
  lab_test_id uuid references public.lab_tests(id),
  reviewing_doctor_id uuid references public.doctors(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  result_title text not null check(length(btrim(result_title)) between 1 and 200),
  result_summary text,
  result_date date not null,
  result_status text not null default 'draft' check(result_status in ('draft','reviewed','released')),
  delivery_state text not null default 'draft' check(delivery_state in ('draft','reviewed','released')),
  released_by uuid references auth.users(id),
  released_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(delivery_state <> 'reviewed' or (reviewed_by is not null and reviewed_at is not null)),
  check(delivery_state <> 'released' or (reviewed_by is not null and reviewed_at is not null and released_by is not null and released_at is not null))
);
create index if not exists clinical_medical_patient_date on public.patient_medical_records(patient_id,record_date desc,id);
create index if not exists clinical_lab_patient_date on public.patient_lab_results(patient_id,result_date desc,id);
create index if not exists clinical_lab_booking on public.patient_lab_results(lab_test_booking_id);

create table if not exists public.patient_clinical_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  medical_record_id uuid references public.patient_medical_records(id),
  lab_result_id uuid references public.patient_lab_results(id),
  object_path text not null unique,
  file_name text not null,
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
  file_size integer not null check(file_size between 1 and 10485760),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check(num_nonnulls(medical_record_id,lab_result_id)=1)
);
create index if not exists clinical_documents_medical on public.patient_clinical_documents(medical_record_id);
create index if not exists clinical_documents_lab on public.patient_clinical_documents(lab_result_id);
create table if not exists public.patient_clinical_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id),
  kind text not null check(kind in ('medical','lab')),
  record_id uuid not null,
  action text not null,
  actor_id uuid references auth.users(id),
  occurred_at timestamptz not null default now()
);
create index if not exists clinical_events_record on public.patient_clinical_events(kind,record_id,occurred_at);
alter table public.patient_notifications add column if not exists href text;

-- Older definer RPCs must not alter findings after review. Changing findings
-- requires an explicit return to draft, followed by a fresh clinical review.
create or replace function public.clinical_guard_medical_content()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.delivery_state='released' and new is distinct from old then raise exception 'Released records are locked; create a follow-up record' using errcode='22023'; end if;
  if old.patient_id is distinct from new.patient_id or old.is_demo is distinct from new.is_demo then raise exception 'Patient ownership and demo identity cannot be changed' using errcode='22023'; end if;
  if old.delivery_state='reviewed' and (
    (to_jsonb(new)-array['delivery_state','reviewed_by','reviewed_at','released_by','released_at','updated_at','result_status']) is distinct from
    (to_jsonb(old)-array['delivery_state','reviewed_by','reviewed_at','released_by','released_at','updated_at','result_status'])) then
    raise exception 'Return to draft before changing reviewed findings' using errcode='22023';
  end if;
  return new;
end; $$;
create trigger clinical_medical_content_guard before update on public.patient_medical_records for each row execute function public.clinical_guard_medical_content();

create or replace function public.clinical_permission(p_kind text,p_release boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select case p_kind when 'medical' then
    public.can_manage_patient_area('clinical_release') or (not p_release and public.can_manage_patient_area('clinical_author'))
    when 'lab' then public.can_manage_patient_area('lab_release') or (not p_release and public.can_manage_patient_area('lab_author')) else false end;
$$;
create or replace function public.clinical_record_access(p_kind text,p_record uuid,p_patient uuid,p_write boolean default false)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
  if p_kind='medical' then select to_jsonb(m) into r from public.patient_medical_records m where id=p_record and patient_id=p_patient;
  elsif p_kind='lab' then select to_jsonb(m) into r from public.patient_lab_results m where id=p_record and patient_id=p_patient;
  else return false; end if;
  if r is null then return false; end if;
  if p_write then return public.clinical_permission(p_kind) and r->>'delivery_state'='draft' and coalesce((r->>'is_demo')::boolean,false)=false; end if;
  return public.clinical_permission(p_kind) or (auth.uid()=p_patient and (
    (r->>'delivery_state'='released' and r->>'released_at' is not null and r->>'reviewed_at' is not null)
    or (p_kind='medical' and r->>'delivery_state'='legacy' and (lower(r->>'result_status')='released'
      or ((r->>'is_demo')::boolean is true and lower(r->>'result_status') in ('recorded','verified','released','amended'))))));
end; $$;

alter table public.patient_medical_records enable row level security;
alter table public.patient_lab_results enable row level security;
alter table public.patient_clinical_documents enable row level security;
alter table public.patient_clinical_events enable row level security;
revoke all on public.patient_medical_records,public.patient_lab_results,public.patient_clinical_documents,public.patient_clinical_events from anon,authenticated;
grant select on public.patient_medical_records,public.patient_lab_results,public.patient_clinical_documents,public.patient_clinical_events to authenticated;
-- Restrictive gates also constrain older permissive policies on deployed tables.
create policy clinical_medical_gate on public.patient_medical_records as restrictive for select to authenticated
using(public.clinical_record_access('medical',id,patient_id) or (public.can_manage_patient_area('billing') and (delivery_state='released' or (delivery_state='legacy' and lower(result_status) in ('verified','released','amended')))));
create policy clinical_medical_read on public.patient_medical_records for select to authenticated
using(public.clinical_record_access('medical',id,patient_id) or (public.can_manage_patient_area('billing') and (delivery_state='released' or (delivery_state='legacy' and lower(result_status) in ('verified','released','amended')))));
create policy clinical_lab_read on public.patient_lab_results for select to authenticated
using(public.clinical_record_access('lab',id,patient_id));
create policy clinical_document_read on public.patient_clinical_documents for select to authenticated
using(public.clinical_record_access(case when medical_record_id is not null then 'medical' else 'lab' end,coalesce(medical_record_id,lab_result_id),patient_id));
create policy clinical_event_read on public.patient_clinical_events for select to authenticated
using(public.clinical_permission(kind));

-- Read names from the verified profiles fields; never infer patient identity
-- from appointments, e-mail, or a supplied name.
create or replace function public.clinical_workspace(p_kind text,p_search text default '',p_patient uuid default null,p_offset integer default 0,p_type text default '',p_status text default '',p_date date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare patients jsonb; records jsonb; doctors jsonb; tests jsonb; bookings jsonb;
begin
  if not public.clinical_permission(p_kind) then raise exception 'Clinical access permission required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(x),'[]') into patients from (
    select p.id,coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.middle_name,p.last_name,p.suffix)),''),'Name not provided') full_name
    from public.profiles p where upper(p.role::text)='PATIENT' and (p.id=p_patient or concat_ws(' ',p.first_name,p.middle_name,p.last_name,p.suffix) ilike '%'||left(p_search,100)||'%' or p.id::text= p_search)
    order by (p.id=p_patient) desc nulls last,p.last_name,p.id limit 50
  ) x;
  select coalesce(jsonb_agg(x),'[]') into doctors from (select id,display_name,specialty from public.doctors where is_demo is false order by display_name) x;
  if p_kind='medical' then
    select coalesce(jsonb_agg(x),'[]') into records from (
      select r.*,concat_ws(' ',p.first_name,p.middle_name,p.last_name,p.suffix) patient_name,d.display_name doctor_name
      from public.patient_medical_records r join public.profiles p on p.id=r.patient_id left join public.doctors d on d.id=r.doctor_id
      where (p_patient is null or r.patient_id=p_patient) and concat_ws(' ',p.first_name,p.middle_name,p.last_name,p.suffix) ilike '%'||left(p_search,100)||'%'
        and (p_type='' or r.record_type=p_type) and (p_status='' or r.delivery_state=p_status) and (p_date is null or r.record_date=p_date)
      order by r.record_date desc,r.id limit 50 offset greatest(0,least(p_offset,100000))
    ) x;
  else
    select coalesce(jsonb_agg(x),'[]') into records from (
      select r.*,concat_ws(' ',p.first_name,p.middle_name,p.last_name,p.suffix) patient_name,d.display_name doctor_name,t.name lab_test_name,b.booking_date
      from public.patient_lab_results r join public.profiles p on p.id=r.patient_id left join public.doctors d on d.id=r.reviewing_doctor_id
      left join public.lab_tests t on t.id=r.lab_test_id left join public.lab_test_bookings b on b.id=r.lab_test_booking_id
      where (p_patient is null or r.patient_id=p_patient) and concat_ws(' ',p.first_name,p.middle_name,p.last_name,p.suffix) ilike '%'||left(p_search,100)||'%'
        and (p_status='' or r.delivery_state=p_status) and (p_date is null or r.result_date=p_date)
      order by r.result_date desc,r.id limit 50 offset greatest(0,least(p_offset,100000))
    ) x;
    select coalesce(jsonb_agg(x),'[]') into tests from (select id,name from public.lab_tests order by name) x;
    select coalesce(jsonb_agg(x),'[]') into bookings from (select b.id,b.lab_test_id,b.booking_date,b.booking_time,b.status,t.name from public.lab_test_bookings b left join public.lab_tests t on t.id=b.lab_test_id where b.patient_id=p_patient order by b.booking_date desc limit 100) x;
  end if;
  return jsonb_build_object('patients',patients,'records',records,'doctors',doctors,'tests',coalesce(tests,'[]'),'bookings',coalesce(bookings,'[]'),
    'canAuthor',public.can_manage_patient_area(case when p_kind='medical' then 'clinical_author' else 'lab_author' end),'canRelease',public.clinical_permission(p_kind,true));
end; $$;

create or replace function public.clinical_save_record(p_kind text,p_id uuid,p_patient uuid,p_values jsonb,p_expected timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; v_doctor uuid; v_test uuid; v_booking uuid; v_table text; v_count integer;
begin
  if p_kind not in ('medical','lab') or not public.can_manage_patient_area(case when p_kind='medical' then 'clinical_author' else 'lab_author' end) then raise exception 'Author permission required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=p_patient and upper(role::text)='PATIENT') then raise exception 'Select a valid patient' using errcode='22023'; end if;
  if length(btrim(coalesce(p_values->>'title',''))) not between 1 and 200 or length(coalesce(p_values->>'description',''))>20000 or nullif(p_values->>'date','') is null then raise exception 'A title, date and valid description are required' using errcode='22023'; end if;
  v_doctor:=nullif(p_values->>'doctor_id','')::uuid;
  if v_doctor is not null and not exists(select 1 from public.doctors where id=v_doctor and is_demo is false) then raise exception 'Select a genuine attending or reviewing doctor' using errcode='22023'; end if;
  v_table:=case when p_kind='medical' then 'patient_medical_records' else 'patient_lab_results' end;
  -- Serializes creates, retrying the same client UUID, and concurrent edits.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,17));
  execute format('select to_jsonb(r) from public.%I r where id=$1 for update',v_table) into r using p_id;
  if r is not null and (r->>'patient_id')::uuid<>p_patient then raise exception 'Record ownership mismatch' using errcode='42501'; end if;
  if r is not null and (r->>'delivery_state'<>'draft' or (r->>'is_demo')::boolean is true) then raise exception 'Only genuine drafts can be edited' using errcode='22023'; end if;
  if r is not null and (p_expected is null or (r->>'updated_at')::timestamptz<>p_expected) then raise exception 'Record changed. Reload before editing.' using errcode='40001'; end if;
  if p_kind='medical' then
    if p_values->>'record_type' not in ('check_up','consultation','diagnostic') then raise exception 'Invalid record type' using errcode='22023'; end if;
    if r is null then
      insert into public.patient_medical_records(id,patient_id,doctor_id,record_type,title,description,record_date,result_status,is_demo,delivery_state)
      values(p_id,p_patient,v_doctor,p_values->>'record_type',btrim(p_values->>'title'),p_values->>'description',(p_values->>'date')::date,'draft',false,'draft');
    else
      update public.patient_medical_records set doctor_id=v_doctor,record_type=p_values->>'record_type',title=btrim(p_values->>'title'),description=p_values->>'description',record_date=(p_values->>'date')::date,updated_at=clock_timestamp() where id=p_id;
    end if;
  else
    v_booking:=nullif(p_values->>'booking_id','')::uuid; v_test:=nullif(p_values->>'test_id','')::uuid;
    if v_test is null or not exists(select 1 from public.lab_tests where id=v_test) then raise exception 'Select a laboratory test' using errcode='22023'; end if;
    if v_booking is not null and not exists(select 1 from public.lab_test_bookings where id=v_booking and patient_id=p_patient and lab_test_id=v_test) then raise exception 'Booking must belong to this patient and laboratory test' using errcode='22023'; end if;
    if r is null then
      insert into public.patient_lab_results(id,patient_id,reviewing_doctor_id,lab_test_booking_id,lab_test_id,result_title,result_summary,result_date)
      values(p_id,p_patient,v_doctor,v_booking,v_test,btrim(p_values->>'title'),p_values->>'description',(p_values->>'date')::date);
    else
      update public.patient_lab_results set reviewing_doctor_id=v_doctor,lab_test_booking_id=v_booking,lab_test_id=v_test,result_title=btrim(p_values->>'title'),result_summary=p_values->>'description',result_date=(p_values->>'date')::date,updated_at=clock_timestamp() where id=p_id;
    end if;
  end if;
  insert into public.patient_clinical_events(patient_id,kind,record_id,action,actor_id) values(p_patient,p_kind,p_id,case when r is null then 'created' else 'draft_edited' end,auth.uid());
  execute format('select to_jsonb(r) from public.%I r where id=$1',v_table) into r using p_id;
  return r;
end; $$;

create or replace function public.clinical_transition_record(p_kind text,p_id uuid,p_patient uuid,p_action text,p_expected timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; v_table text; v_state text;
begin
  if not public.clinical_permission(p_kind,true) then raise exception 'Explicit clinical review and release permission required' using errcode='42501'; end if;
  if p_action not in ('review','release','return_to_draft') then raise exception 'Invalid transition' using errcode='22023'; end if;
  v_table:=case when p_kind='medical' then 'patient_medical_records' else 'patient_lab_results' end;
  execute format('select to_jsonb(r) from public.%I r where id=$1 and patient_id=$2 for update',v_table) into r using p_id,p_patient;
  if r is null then raise exception 'Record not found for this patient' using errcode='P0002'; end if;
  if (r->>'is_demo')::boolean is true then raise exception 'Demo history cannot be clinically reviewed or released as a real record' using errcode='22023'; end if;
  if p_expected is null or (r->>'updated_at')::timestamptz<>p_expected then raise exception 'Record changed. Reload before continuing.' using errcode='40001'; end if;
  if p_action='review' then
    if r->>'delivery_state' not in ('draft','legacy') or coalesce(r->>'doctor_id',r->>'reviewing_doctor_id') is null then raise exception 'A draft and assigned doctor are required for review' using errcode='22023'; end if;
    execute format('update public.%I set delivery_state=''reviewed'',reviewed_by=$1,reviewed_at=now(),updated_at=clock_timestamp() where id=$2',v_table) using auth.uid(),p_id;
  elsif p_action='return_to_draft' then
    if r->>'delivery_state'<>'reviewed' then raise exception 'Only reviewed, unreleased records can return to draft' using errcode='22023'; end if;
    execute format('update public.%I set delivery_state=''draft'',reviewed_by=null,reviewed_at=null,updated_at=clock_timestamp() where id=$1',v_table) using p_id;
  else
    if r->>'delivery_state'<>'reviewed' or r->>'reviewed_by' is null or r->>'reviewed_at' is null then raise exception 'Clinical review is required before release' using errcode='22023'; end if;
    execute format('update public.%I set delivery_state=''released'',result_status=''released'',released_by=$1,released_at=now(),updated_at=clock_timestamp() where id=$2',v_table) using auth.uid(),p_id;
    insert into public.patient_notifications(patient_id,title,body,event_key,href)
    values(p_patient,case when p_kind='medical' then 'A new medical record is available.' else 'Your laboratory result is ready to view.' end,
      'Sign in to your patient portal to view your released record.',p_kind||':'||p_id||':released',case when p_kind='medical' then '/patient/medical-history' else '/patient/laboratory-results' end)
    on conflict(patient_id,event_key) do nothing;
  end if;
  insert into public.patient_clinical_events(patient_id,kind,record_id,action,actor_id) values(p_patient,p_kind,p_id,p_action,auth.uid());
  execute format('select to_jsonb(r) from public.%I r where id=$1',v_table) into r using p_id;
  return r;
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('patient-medical-documents','patient-medical-documents',false,10485760,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy clinical_storage_read on storage.objects for select to authenticated using(bucket_id='patient-medical-documents' and exists(
  select 1 from public.patient_clinical_documents d where d.object_path=name));
create policy clinical_storage_read_gate on storage.objects as restrictive for select to authenticated using(bucket_id<>'patient-medical-documents' or exists(
  select 1 from public.patient_clinical_documents d where d.object_path=name));
-- All uploads pass through the server's byte/signature validation. No direct
-- authenticated storage writes, overwrites, or deletes in this bucket.
create policy clinical_storage_insert_gate on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'patient-medical-documents');
create policy clinical_storage_update_gate on storage.objects as restrictive for update to authenticated using(bucket_id<>'patient-medical-documents') with check(bucket_id<>'patient-medical-documents');
create policy clinical_storage_delete_gate on storage.objects as restrictive for delete to authenticated using(bucket_id<>'patient-medical-documents');

create or replace function public.clinical_attach_document(p_kind text,p_id uuid,p_patient uuid,p_document uuid,p_path text,p_name text,p_mime text,p_size integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_table text;
begin
  v_table:=case p_kind when 'medical' then 'patient_medical_records' when 'lab' then 'patient_lab_results' else null end;
  if v_table is null then raise exception 'Invalid kind'; end if;
  execute format('select id from public.%I where id=$1 for update',v_table) using p_id;
  if not public.clinical_record_access(p_kind,p_id,p_patient,true) or not public.can_manage_patient_area(case when p_kind='medical' then 'clinical_author' else 'lab_author' end) then raise exception 'A genuine draft and author permission are required' using errcode='42501'; end if;
  if p_path<>(p_patient||'/'||p_kind||'/'||p_id||'/'||p_document||(case p_mime when 'application/pdf' then '.pdf' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else '' end))
    or not exists(select 1 from storage.objects where bucket_id='patient-medical-documents' and name=p_path) then raise exception 'Invalid document ownership or storage path' using errcode='22023'; end if;
  insert into public.patient_clinical_documents(id,patient_id,medical_record_id,lab_result_id,object_path,file_name,mime_type,file_size,uploaded_by)
  values(p_document,p_patient,case when p_kind='medical' then p_id end,case when p_kind='lab' then p_id end,p_path,left(p_name,200),p_mime,p_size,auth.uid());
  execute format('update public.%I set updated_at=clock_timestamp() where id=$1',v_table) using p_id;
  insert into public.patient_clinical_events(patient_id,kind,record_id,action,actor_id) values(p_patient,p_kind,p_id,'document_attached',auth.uid());
  return p_document;
end; $$;

create or replace function public.clinical_document_access(p_document uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.patient_clinical_documents; k text;
begin
  select * into d from public.patient_clinical_documents where id=p_document;
  k:=case when d.medical_record_id is not null then 'medical' else 'lab' end;
  if d.id is null or not public.clinical_record_access(k,coalesce(d.medical_record_id,d.lab_result_id),d.patient_id) then raise exception 'Document unavailable' using errcode='42501'; end if;
  insert into public.patient_clinical_events(patient_id,kind,record_id,action,actor_id) values(d.patient_id,k,coalesce(d.medical_record_id,d.lab_result_id),'document_access',auth.uid());
  return to_jsonb(d);
end; $$;

-- No public/anonymous execution of definer functions.
revoke all on function public.clinical_permission(text,boolean), public.clinical_record_access(text,uuid,uuid,boolean), public.clinical_workspace(text,text,uuid,integer,text,text,date), public.clinical_save_record(text,uuid,uuid,jsonb,timestamptz), public.clinical_transition_record(text,uuid,uuid,text,timestamptz), public.clinical_attach_document(text,uuid,uuid,uuid,text,text,text,integer), public.clinical_document_access(uuid) from public,anon;
grant execute on function public.clinical_permission(text,boolean), public.clinical_record_access(text,uuid,uuid,boolean), public.clinical_workspace(text,text,uuid,integer,text,text,date), public.clinical_save_record(text,uuid,uuid,jsonb,timestamptz), public.clinical_transition_record(text,uuid,uuid,text,timestamptz), public.clinical_attach_document(text,uuid,uuid,uuid,text,text,text,integer), public.clinical_document_access(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
