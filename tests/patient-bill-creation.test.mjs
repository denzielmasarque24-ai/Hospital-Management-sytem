import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Admin Patient Payments uses the existing protected bill RPC and real charge table',()=>{
  const component=read('../components/admin/CreatePatientBill.tsx');
  const migration=read('../supabase/migrations/20261206000000_billing_patient_directory.sql');
  const billMigration=read('../supabase/migrations/20261202000000_charge_based_payments_and_bill_approval.sql');
  const page=read('../app/(app)/admin/payments/page.tsx');
  assert.match(page,/CreatePatientBill/);
  assert.match(component,/rpc\("billing_patient_directory"/);
  assert.match(component,/rpc\("billing_create_patient_bill"/);
  assert.match(component,/rpc\("billing_approve_patient_bill"/);
  assert.match(component,/p_items: items/);
  assert.doesNotMatch(component,/from\("patient_bills"\)\.insert|from\("patient_medical_charges"\)\.insert/);
  assert.match(billMigration,/insert into public\.patient_bills[\s\S]*?is_demo\)[\s\S]*?false/);
  assert.match(billMigration,/insert into public\.patient_medical_charges[\s\S]*?is_demo\)[\s\S]*?false/);
  assert.match(billMigration,/if not public\.can_manage_patient_area\('billing'\)/);
  assert.match(migration,/security definer[\s\S]*?set search_path = ''/);
  assert.match(migration,/if not public\.can_manage_patient_area\('billing'\)/);
  assert.match(migration,/revoke all on function public\.billing_patient_directory\(text, integer, integer\) from public, anon/);
  assert.match(migration,/grant execute on function public\.billing_patient_directory\(text, integer, integer\) to authenticated/);
});
