import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Admin Patient Payments saves drafts and finalized bills through the protected RPC',()=>{
  const component=read('../components/admin/CreatePatientBill.tsx');
  const migration=read('../supabase/migrations/20261212000000_billing_save_patient_bill_rpc.sql');
  const page=read('../app/(app)/admin/payments/page.tsx');
  assert.match(page,/CreatePatientBill/);
  assert.match(component,/rpc\("admin_patient_directory"/);
  assert.match(component,/from\("patient_admissions"\)\.select\("id,patient_id,doctor_id,room_id,admitted_at,discharged_at,status/);
  assert.match(component,/hospital_rooms\(id,room_number,room_type,bed_number,status,daily_rate,is_demo\)/);
  assert.match(component,/doctors\(id,display_name,specialty,department/);
  assert.doesNotMatch(component,/billing_patient_care_details|billing_patient_consultations/);
  assert.match(component,/rpc\("billing_save_patient_bill"/);
  assert.match(component,/p_items: serialize\(\)/);
  assert.doesNotMatch(component,/from\("patient_bills"\)\.insert|from\("patient_medical_charges"\)\.insert/);
  assert.match(migration,/if not public\.can_manage_patient_area\('billing'\)/);
  assert.match(migration,/insert into public\.patient_bills[\s\S]*?values\(p_patient_id,p_admission_id,v_number,[\s\S]*?false,'unpaid'\)/);
  assert.match(migration,/insert into public\.patient_medical_charges[\s\S]*?is_demo\)[\s\S]*?false/);
  assert.match(migration,/security definer set search_path = ''/);
  assert.match(migration,/revoke all on function public\.billing_save_patient_bill/);
  assert.match(migration,/grant execute on function public\.billing_save_patient_bill/);
  assert.match(migration,/notify pgrst,'reload schema'/i);
});
