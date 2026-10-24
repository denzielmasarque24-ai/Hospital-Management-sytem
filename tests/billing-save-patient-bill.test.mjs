import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('bill save RPC migration exposes current and reported PostgREST signatures safely', () => {
  const migration = read('../supabase/migrations/20261212000000_billing_save_patient_bill_rpc.sql');
  const restore = read('../supabase/migrations/20261220000000_restore_billing_save_patient_bill_rpc.sql');
  assert.match(migration, /billing_save_patient_bill\(\s*p_bill_id uuid,[\s\S]*?p_patient_id uuid,[\s\S]*?p_items jsonb,[\s\S]*?p_finalize boolean/);
  assert.match(migration, /billing_save_patient_bill\(\s*p_admission_id uuid,\s*p_bill_id uuid,[\s\S]*?p_items jsonb,\s*p_taxes numeric/);
  assert.match(migration, /can_manage_patient_area\('billing'\)/);
  assert.match(migration, /is_demo is false/);
  assert.match(migration, /payment_approved_at is not null/);
  assert.match(migration, /patient_admissions a where a\.id=p_admission_id and a\.patient_id=p_patient_id/);
  assert.match(migration, /patient_medical_charges/);
  assert.doesNotMatch(migration, /patient_bill_items/);
  assert.match(migration, /notify pgrst,'reload schema'/i);
  const restoreStart = restore.indexOf('create or replace function public.billing_save_patient_bill(');
  const restoreEnd = restore.indexOf('language plpgsql', restoreStart);
  assert.notEqual(restoreStart, -1);
  assert.equal(restore.slice(restoreStart, restoreEnd).replace(/\s+/g, ' ').trim(), 'create or replace function public.billing_save_patient_bill( p_bill_id uuid, p_external_reference uuid, p_patient_id uuid, p_admission_id uuid, p_items jsonb, p_discount numeric, p_discount_reason text, p_taxes numeric, p_finalize boolean default false ) returns jsonb');
  assert.match(restore, /revoke all on function public\.billing_save_patient_bill\(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean\) from public,anon/i);
  assert.match(restore, /grant execute on function public\.billing_save_patient_bill\(uuid,uuid,uuid,uuid,jsonb,numeric,text,numeric,boolean\) to authenticated/i);
  assert.match(restore, /notify pgrst,\s*'reload schema'/i);
  assert.match(restore, /drop policy if exists billing_staff_read_financial_authorizations/i);
  assert.match(restore, /v_argument_names\[1:9\] is distinct from array/i);
  assert.match(restore, /'p_discount','p_discount_reason','p_taxes','p_finalize'/i);
  assert.match(restore, /has_function_privilege\('authenticated',v_function,'EXECUTE'\)/i);
  const frontend = read('../components/admin/CreatePatientBill.tsx');
  assert.match(frontend, /rpc\("billing_save_patient_bill",\s*\{\s*p_bill_id:[\s\S]*?p_external_reference:[\s\S]*?p_patient_id:[\s\S]*?p_admission_id:[\s\S]*?p_items:[\s\S]*?p_discount:[\s\S]*?p_discount_reason:[\s\S]*?p_taxes:[\s\S]*?p_finalize:/);
});

test('current billing RPC rejects demo admissions and does not depend on legacy room assignment records',()=>{
  const migration=read('../supabase/migrations/20261215000000_billing_rpc_remove_legacy_room_assignment.sql');
  assert.match(migration,/to_jsonb\(a\)->>'is_demo'/);
  assert.match(migration,/Professional fees must reference a released care record/);
  assert.match(migration,/to_jsonb\(d\)->>'is_demo'/);
  assert.match(migration,/r\.result_status/);
  assert.match(migration,/d\.display_name/);
  assert.doesNotMatch(migration,/r\.(?:status|released_at|admission_id|reason)\b|d\.(?:first_name|last_name)\b/);
  assert.match(migration,/Room charges require an independently verified rate/);
  assert.doesNotMatch(migration,/patient_room_assignments|room_assignment_id/);
  assert.match(migration,/notify pgrst,'reload schema'/i);
});

test('admin sends patient scoped RPC data and preserves the form on errors', () => {
  const admin = read('../components/admin/CreatePatientBill.tsx');
  assert.match(admin, /rpc\("billing_save_patient_bill"/);
  assert.match(admin, /p_patient_id: patient\.patient_id/);
  assert.match(admin, /_patient_id: patient\?\.patient_id/);
  assert.match(admin, /if \(saveError\) \{[\s\S]*?setLineErrors[\s\S]*?throw saveError/);
  assert.match(admin, /setLines\(\(old\) => old\.map/);
});

test('patient bill total reconciles charges, discount, taxes, and verified payments', () => {
  const patient = read('../components/patient/PatientBillingContent.tsx');
  assert.match(patient, /const discount = Number\(bill\.approved_discount/);
  assert.match(patient, /const taxes = Number\(bill\.taxes_and_fees/);
  assert.match(patient, /subtotal-discount\+taxes/);
  assert.match(patient, /Outstanding balance/);
  assert.match(patient, /verifiedPaymentStatuses/);
});

test('billing care assignment uses confirmed admission, room, doctor, and clinical records', () => {
  const admin = read('../components/admin/CreatePatientBill.tsx');
  const roomDrawer=read('../components/admin/RoomBedAssignmentDrawer.tsx');
  const patientQueries = read('../lib/patient/queries.mjs');
  assert.match(admin, /from\("patient_admissions"\)\.select\("id,patient_id,doctor_id,room_id,admitted_at,discharged_at,status/);
  assert.match(admin, /hospital_rooms\(id,room_number,room_type,bed_number,status,daily_rate,is_demo\)/);
  assert.match(admin, /doctors\(id,display_name,specialty,department/);
  assert.match(admin, /from\("patient_medical_records"\)/);
  assert.doesNotMatch(admin, /billing_patient_care_details|billing_patient_consultations|billing_patient_payment_summary/);
  assert.match(admin, /from\("patient_admissions"\)\.update\(\{doctor_id:doctorId\}\)/);
  assert.match(roomDrawer, /from\("hospital_rooms"\)/);
  assert.match(roomDrawer, /from\("patient_admissions"\)\.update\(\{room_id:roomId\}\)/);
  assert.doesNotMatch(roomDrawer, /admin_hospital_room_directory|admin_assign_admission_room/);
  assert.match(admin, /alreadyCharged/);
  assert.match(patientQueries, /relatedRows\(client,'doctors'/);
  assert.doesNotMatch(patientQueries, /public_doctors|patient_room_assignments|patient_doctor_assignments|patient_lab_orders/);
  assert.doesNotMatch(admin, /from\("patient_bill_items"\)/);
});
