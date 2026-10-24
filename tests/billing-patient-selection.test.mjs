import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isValidUuid, normalizeBillingPatient, createPatientRequestScope } from '../lib/admin/billing-patient.mjs';
import * as billingValidation from '../lib/admin/billing-validation.mjs';

const patientA = '152e079d-da6d-49cb-95f0-0fe6cecef58e';
const patientB = '252e079d-da6d-49cb-95f0-0fe6cecef58e';

test('directory IDs normalize to patient_id and malformed or conflicting IDs are rejected', () => {
  for (const id of [undefined, null, '', 'undefined', 'null', 'not-a-uuid', 123]) {
    assert.equal(isValidUuid(id), false);
    assert.throws(() => normalizeBillingPatient({ patient_id: id }));
  }
  assert.equal(normalizeBillingPatient({ patient_id: patientA }).patient_id, patientA);
  assert.equal(normalizeBillingPatient({ id: patientA }).patient_id, patientA);
  assert.throws(() => normalizeBillingPatient({ patient_id: patientA, id: patientB }));
  assert.throws(() => normalizeBillingPatient({ profile_id: patientA }));
  assert.equal(normalizeBillingPatient({ patient_id: patientA, doctor_id: patientB }).doctor_id, undefined);
});

test('request scope discards stale responses even when switching back to the same patient', () => {
  const scope = createPatientRequestScope();
  const first = scope.begin(patientA);
  scope.begin(patientB);
  scope.begin(patientA);
  assert.equal(scope.isCurrent(patientA, first), false);
  const current = scope.snapshot();
  scope.clear();
  assert.equal(current(), false);
});

// Execute the real component with a small hook host and a mocked Supabase client.
// Deferred admission queries reproduce switching patients while requests are pending.
function componentHost(directory, saveResponse = null) {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const React = require('react');
  const slots = [];
  let cursor = 0;
  const pending = [];
  const queries = [];
  const rpcCalls = [];
  const client = { rpc: async (name, args) => {rpcCalls.push({name,args});return name==='billing_save_patient_bill' ? await saveResponse(args) : {data:{approvals:[],canApprove:false},error:null};}, from(table) {
    const filters = {};
    const query = {
      select() { return query; }, eq(key, value) { assert.ok(value !== undefined && value !== 'undefined'); filters[key] = value; return query; },
      order() { return query; }, limit() { return query; },
      not() { return query; },
      then(resolve, reject) {
        queries.push({ table, filters });
        if (table === 'patient_admissions') return new Promise(done => pending.push({ id: filters.patient_id, done })).then(resolve, reject);
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  const hooks = { ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = index === 1 ? directory : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect() {}, useCallback(fn) { return fn; }, useMemo(fn) { return fn(); },
  };
  const source = readFileSync(new URL('../components/admin/CreatePatientBill.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  new Function('require', 'exports', compiled)(name => {
    if (name === 'react') return hooks;
    if (name === '@/lib/supabase/client') return { supabase: client };
    if (name === '@/lib/admin/billing-patient.mjs') return { isValidUuid, normalizeBillingPatient, createPatientRequestScope };
    if (name === '@/lib/admin/billing-validation.mjs') return billingValidation;
    if (name === '@/components/admin/BillingAuthorizations') return {BillingAuthorizations(){return null;}};
    if (name === '@/components/admin/RoomBedAssignmentDrawer') return { RoomBedAssignmentDrawer() { return null; } };
    return require(name);
  }, exports);
  function render() { cursor = 0; return exports.CreatePatientBill(); }
  function find(node, predicate) {
    if (Array.isArray(node)) return node.flatMap(child => find(child, predicate));
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
  }
  return { slots, pending, queries, rpcCalls,
    save() { find(render(),node=>node.type==='button'&&node.props.className==='mw-bill-draft')[0].props.onClick(); },
    rows() { return find(render(),node=>typeof node.type==='function'&&node.type.name==='ChargeRow'); },
    select(id) { const tree = render(); const button = find(tree, n => n.type === 'button' && n.key === id)[0]; assert.ok(button); button.props.onClick(); },
    clear() { const tree = render(); find(tree, n => n.type === 'button' && n.props.children === 'Change')[0].props.onClick(); },
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('billing selection prevents invalid queries and ignores stale admissions, room and doctor results', async () => {
  const malformed = componentHost([{ patient_id: 'undefined', full_name: 'Malformed' }]);
  malformed.select('undefined');
  await flush();
  assert.equal(malformed.queries.length, 0);
  assert.equal(malformed.slots[2], null);
  assert.match(malformed.slots[27], /invalid|UUID/i);

  const host = componentHost([{ patient_id: patientA }, { patient_id: patientB }]);
  host.select(patientA);
  await flush();
  host.clear();
  host.select(patientB);
  await flush();
  const admission = { id: 'fd9658b0-4e37-499c-b72e-399db49283df', patient_id: patientB, status: 'discharged', admitted_at: '2026-10-18', discharged_at: '2026-10-20', is_demo: true,
    room_id: patientA, hospital_rooms: { id: patientA, room_number: 'Test Room', bed_number: 'Bed 1', is_demo: true },
    doctors: { id: patientA, display_name: 'Test Doctor', consultation_fee: 500, is_demo: true } };
  host.pending.find(row => row.id === patientB).done({ data: [admission], error: null });
  await flush();
  assert.equal(host.slots[2].patient_id, patientB);
  assert.equal(host.slots[2].room_number, 'Test Room');
  assert.equal(host.slots[2].doctor_name, 'Test Doctor');
  assert.equal(host.slots[2].admission_status, 'discharged');
  assert.equal(host.slots[2].is_demo, true);
  assert.deepEqual(host.slots[13], []); // No charge is inferred from admission details.
  host.pending.find(row => row.id === patientA).done({ data: [], error: { message: 'Stale request failed' } });
  await flush();
  assert.equal(host.slots[2].patient_id, patientB);
  assert.equal(host.slots[2].room_number, 'Test Room');
  assert.equal(host.slots[28], '');
});

test('billing shows row-specific field errors, preserves edits, and prevents simultaneous save submissions', async()=>{
  let finish;
  const host=componentHost([{patient_id:patientA}],()=>new Promise(resolve=>{finish=resolve;}));
  host.select(patientA);await flush();host.pending[0].done({data:[],error:null});await flush();
  const product={id:'352e079d-da6d-49cb-95f0-0fe6cecef58e',name:'Fixture supply',category:'Medical Supply',price:25,stock:10,available:true};
  host.slots[3]=[product];
  host.slots[13]=[{key:'stable-editable-row',category:'medical_supply',description:'',quantity:'1.1234',unitPrice:'24.99',productId:product.id,date:'2026-10-24'}];
  host.save();await flush();
  const props=host.rows()[0].props;
  assert.match(props.errors.description,/Description is required/);
  assert.match(props.errors.quantity,/3 decimal places/);
  assert.match(props.errors.unitPrice,/catalog price/);
  assert.equal(host.rpcCalls.filter(call=>call.name==='billing_save_patient_bill').length,0);
  props.onChange(props.line.key,{description:product.name,quantity:'2',unitPrice:'25.00'});
  host.save();host.save();await flush();
  const saves=host.rpcCalls.filter(call=>call.name==='billing_save_patient_bill');
  assert.equal(saves.length,1);
  assert.equal(saves[0].args.p_items[0].quantity,'2');
  assert.equal(saves[0].args.p_items[0].unit_price,'25.00');
  assert.equal(host.slots[13][0].key,'stable-editable-row');
  finish({data:{bill_id:'452e079d-da6d-49cb-95f0-0fe6cecef58e',bill_number:'Fixture bill'},error:null});
  await flush();
  assert.equal(host.slots[14],'452e079d-da6d-49cb-95f0-0fe6cecef58e');
  assert.equal(host.slots[13][0].quantity,'2');
});
