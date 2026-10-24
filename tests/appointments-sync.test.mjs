import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('patient appointments use the confirmed appointment columns and related service/doctor records',()=>{
  const page=read('../app/(patient)/patient/appointments/page.tsx');
  const home=read('../lib/patient/queries.mjs');
  const component=read('../components/patient/PatientAppointments.tsx');
  assert.match(page,/patientRows\(supabase,"appointments",user\.id,"id,patient_id,doctor_id,service_id,appointment_date,appointment_time,status,notes,created_at"/);
  assert.match(page,/relatedRows\(supabase,"services"[\s\S]*?"id,name,description"/);
  assert.match(page,/relatedRows\(supabase,"doctors"[\s\S]*?"id,display_name,specialty,department"/);
  assert.doesNotMatch(page,/row\.department\|\|doctor\?\.department/);
  assert.match(home,/patientRows\(client,'appointments',patientId,'id,doctor_id,service_id,appointment_date,appointment_time,status,notes,created_at'/);
  assert.match(component,/postgres_changes/);
  assert.match(component,/Appointment ID:/);
});

test('admin appointment management looks up authorized profiles by name fields and manages requests/statuses',()=>{
  const page=read('../app/(app)/admin/appointments/page.tsx');
  const migration=read('../supabase/migrations/20261216000000_admin_review_appointment_change_requests.sql');
  assert.match(page,/select\("id,patient_id,doctor_id,service_id,appointment_date,appointment_time,status,notes,created_at"\)/);
  assert.match(page,/profiles"\)\.select\("id,first_name,middle_name,last_name,suffix"\)/);
  assert.doesNotMatch(page,/profiles"\)\.select\([^\n]*full_name/);
  assert.match(page,/services"\)\.select\("id,name,description"\)/);
  assert.match(page,/doctors"\)\.select\("id,display_name,specialty,department"\)/);
  assert.match(page,/type="date"/);
  assert.match(page,/setSelected\(appointment\)/);
  assert.match(page,/rpc\("admin_review_appointment_change_request"/);
  assert.match(page,/update\(\{status:nextStatus\}\)/);
  assert.match(page,/postgres_changes/);
  assert.match(migration,/current_admin_role\(\)/);
  assert.match(migration,/for update/);
  assert.match(migration,/set appointment_date=v_request\.requested_date,appointment_time=v_request\.requested_time/);
  assert.match(migration,/notify pgrst,'reload schema'/i);
  assert.match(migration,/revoke all on function public\.admin_review_appointment_change_request\(uuid,text\) from public,anon/);
});
