import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMedicalHistory,chargeAmount,hasReleasedResult,isCurrentAdmission,isDemo,patientDateKey,summarizeBills} from '../lib/patient/dashboard.mjs';
import {loadPatientSection,patientRows,relatedRows} from '../lib/patient/queries.mjs';

const patient='00000000-0000-4000-8000-000000000001';
const charges=[1500,900,1000,200,330].map((amount,i)=>({id:`charge-${i}`,patient_id:patient,bill_id:'bill',item_name:`Fixture charge ${i}`,category:i>2?'medical_supply':'consultation',quantity:1,unit_price:amount,total_amount:amount,is_demo:true}));
const bills=[{id:'bill',patient_id:patient,bill_number:'DEMO-TEST',is_demo:true,total_amount:99999}];
const payments=[{id:'payment',patient_id:patient,bill_id:'bill',amount:2000,status:'completed',is_demo:true}];

function fixture(tables={},errors={}) {
  const calls=[];
  return {calls,from(table){
    const filters=[];
    let columns;
    let order;
    return {select(value){columns=value;return this;},eq(key,value){filters.push([key,value]);return this;},in(key,values){filters.push([key,values]);return this;},order(column,options){order={column,...options};return this;},async range(start,end){
      calls.push({table,filters,columns,order});
      if(errors[table])return {error:errors[table]};
      return {data:(tables[table]??[]).filter(row=>filters.every(([key,value])=>Array.isArray(value)?value.includes(row[key]):row[key]===value)).slice(start,end+1)};
    }};
  }};
}

test('billing uses five actual charges and completed payments: 3930 - 2000 = 1930',()=>{
  const [bill]=summarizeBills(bills,charges,payments);
  assert.equal(bill.items.length,5);
  assert.equal(bill.total,3930);
  assert.equal(bill.paid,2000);
  assert.equal(bill.balance,1930);
  assert.equal(bill.demo,true);
  assert.equal(charges.filter(row=>row.category==='medical_supply').length,2);
  assert.equal(charges.filter(row=>row.category==='medical_supply').reduce((sum,row)=>sum+chargeAmount(row),0),530);
});

test('demo simulations update only demo balances and do not affect real bill totals',()=>{
  const [demo,real]=summarizeBills(
    [...bills,{id:'real',patient_id:patient,bill_number:'REAL-1',is_demo:false}],
    [...charges,{id:'real-charge',patient_id:patient,bill_id:'real',quantity:1,unit_price:100,total_amount:100,is_demo:false}],
    [...payments,{id:'real-payment',patient_id:patient,bill_id:'real',amount:20,status:'completed',is_demo:false}],
    [],
    [{id:'sim-1',patient_id:patient,bill_id:'bill',amount:500,status:'simulated',is_demo:true}]
  );
  assert.equal(demo.paid,2500);
  assert.equal(demo.balance,1430);
  assert.equal(real.paid,20);
  assert.equal(real.balance,80);
});

test('a legacy demo payment mirrored in the simulation ledger is counted once',()=>{
  const legacy={...payments[0],reference_number:'DEMO-PAY-REFERENCE'};
  const [bill]=summarizeBills(bills,charges,[legacy],[],[
    {id:'sim-copy',bill_id:'bill',reference_number:'DEMO-PAY-REFERENCE',amount:2000,status:'simulated',is_demo:true},
    {id:'sim-new',bill_id:'bill',reference_number:'DEMO-PAY-NEW',amount:500,status:'simulated',is_demo:true},
  ]);
  assert.equal(bill.paid,2500);
  assert.equal(bill.balance,1430);
  assert.equal(bill.demoPayments.length,1);
});

test('demo bill totals exclude any charge not explicitly marked as demo',()=>{
  const [bill]=summarizeBills(bills,[...charges,{id:'unexpected-real',bill_id:'bill',quantity:1,unit_price:700,is_demo:false}],payments);
  assert.equal(bill.total,3930);
  assert.equal(bill.items.length,5);
});

test('pending and failed payments are ignored, refund ledger entries reduce net confirmed payments, and unrelated payments do not count',()=>{
  const extra=['pending','failed',undefined].map((status,i)=>({id:`ignored-${i}`,bill_id:'bill',amount:5000,status}));
  const [bill]=summarizeBills(bills,charges,[{...payments[0],amount:2000,external_reference:'online-1'},...extra,{id:'refunded',bill_id:'bill',amount:5000,status:'refunded'},{bill_id:'other',amount:8000,status:'completed'}],[{online_payment_id:'online-1',amount:500,status:'succeeded'}]);
  assert.equal(bill.paid,1500);
  assert.equal(bill.balance,2430);
  assert.throws(()=>chargeAmount({total_amount:'invalid'}),/invalid amount/);
});

test('financial calculations round to cents and do not produce negative outstanding amounts',()=>{
  const [bill]=summarizeBills([{id:'small'}],[{bill_id:'small',quantity:3,unit_price:0.1}],[{bill_id:'small',amount:1,status:'completed'}]);
  assert.equal(bill.total,0.3);
  assert.equal(bill.balance,0);
});

test('three clinical entries and a linked completed CBC booking produce three timeline entries without claiming a verified result',()=>{
  const records=[{id:'check',record_type:'check_up',occurred_at:'2026-01-01',is_demo:true},{id:'lab',category:'laboratory',title:'CBC',lab_test_booking_id:'cbc',occurred_at:'2026-01-02',is_demo:true},{id:'scan',category:'diagnostic',occurred_at:'2026-01-03',is_demo:true}];
  const history=buildMedicalHistory(records,[{id:'cbc',lab_test_id:'test',status:'completed',booking_date:'2026-01-02'}],[{id:'test',name:'CBC'}],[]);
  assert.equal(history.length,3);
  assert.deepEqual(new Set(history.map(row=>row.kind)),new Set(['checkup','laboratory','diagnostic']));
  assert(history.every(row=>row.demo && !row.resultAvailable));
  assert.match(history.find(row=>row.title==='CBC').description,/CBC \(completed\)/);
});

test('unlinked CBC bookings appear, while completion alone never verifies a result and drafts remain hidden',()=>{
  const history=buildMedicalHistory([{id:'draft',status:'draft'}],[{id:'cbc',test_id:'test',status:'completed'}],[{id:'test',name:'CBC'}],[]);
  assert.equal(history.length,1);
  assert.equal(history[0].title,'CBC');
  assert.equal(history[0].resultAvailable,false);
  assert.equal(hasReleasedResult({status:'completed',result_available:true}),false);
  assert.equal(hasReleasedResult({status:'released',verified_by:'clinician',released_at:'2026-01-01'}),true);
});

test('discharged admissions and historical demo rooms never count as current',()=>{
  assert.equal(isCurrentAdmission({status:'discharged',discharge_date:'2026-01-02'}),false);
  assert.equal(isCurrentAdmission({status:'admitted',discharge_date:'2026-01-02'}),false);
  assert.equal(isCurrentAdmission({status:'pending'}),false);
  assert.equal(isCurrentAdmission({status:'admitted',discharge_date:null}),true);
  assert.equal(isDemo({room_number:'DEMO-R201'}),true);
});

test('all seven modules scope patient records by the authenticated ID and only resolve related IDs',async()=>{
  const doctorId='00000000-0000-4000-8000-000000000002',roomId='00000000-0000-4000-8000-000000000003',testId='00000000-0000-4000-8000-000000000004';
  const tables={appointments:[{id:'00000000-0000-4000-8000-000000000010',patient_id:patient},{id:'00000000-0000-4000-8000-000000000011',patient_id:'00000000-0000-4000-8000-000000000099'}],patient_bills:bills,patient_payments:payments,patient_medical_charges:charges,online_payments:[],patient_admissions:[{id:'admission',patient_id:patient,room_id:roomId,doctor_id:doctorId}],hospital_rooms:[{id:roomId,room_number:'DEMO-R201'}],patient_doctor_assignments:[{id:'assignment',patient_id:patient,doctor_id:doctorId,ended_at:null},{id:'ended',patient_id:patient,doctor_id:'00000000-0000-4000-8000-000000000005',ended_at:'2026-01-01'}],doctors:[{id:doctorId,display_name:'Fixture doctor'}],patient_medical_records:[{id:'record',patient_id:patient,doctor_id:doctorId}],lab_test_bookings:[{id:'booking',patient_id:patient,lab_test_id:testId}],lab_tests:[{id:testId,name:'CBC'}]};
  for(const section of ['assigned-doctor','medical-history','admissions','room-information','billing','medical-supplies']) {
    const client=fixture(tables),data=await loadPatientSection(client,patient,section);
    for(const call of client.calls.filter(call=>!['doctors','hospital_rooms','lab_tests'].includes(call.table))) {
      assert(call.table!=='patient_bill_items',`${section}: nonexistent invoice table must never be queried`);
      assert(call.filters.some(([key,value])=>key==='patient_id'&&value===patient),`${section}: ${call.table}`);
    }
    if(section==='assigned-doctor') {assert.equal(data.assignments.length,1);assert.equal(data.doctors[0].id,doctorId);}
    if(section==='room-information')assert.equal(data.rooms[0].room_number,'DEMO-R201');
    if(section==='medical-supplies')assert.equal(data.charges.length,2);
  }
  assert.equal((await patientRows(fixture(tables),'appointments',patient)).length,1);
  assert.throws(()=>patientRows(fixture(),'appointments',''),/authenticated patient/);
});

test('missing tables and denied reads surface errors instead of empty successful pages',async()=>{
  for(const code of ['PGRST205','42501']) await assert.rejects(loadPatientSection(fixture({}, {patient_bills:{code,message:'sensitive server detail'}}),patient,'billing'),error=>error.code===code&&error.table==='patient_bills'&&!error.message.includes('sensitive'));
});

test('billing queries only non-demo bills, charges and payments without loading simulations or patient_bill_items',async()=>{
  const realBill={id:'real-bill',patient_id:patient,bill_number:'INV-1',is_demo:false};
  const realCharge={id:'real-charge',patient_id:patient,bill_id:'real-bill',quantity:1,unit_price:100,is_demo:false};
  const realPayment={id:'real-payment',patient_id:patient,bill_id:'real-bill',amount:25,status:'completed',is_demo:false};
  const simulation={id:'sim-1',patient_id:patient,bill_id:'bill',reference_number:'DEMO-PAY-ONE',amount:100,payment_method:'gcash',status:'simulated',idempotency_key:'key-1',created_at:'2026-10-23T00:00:00Z'};
  const client=fixture({patient_bills:[...bills,realBill],patient_medical_charges:[...charges,realCharge],patient_payments:[...payments,realPayment],online_payments:[],demo_payment_simulations:[simulation]});
  const data=await loadPatientSection(client,patient,'billing');
  assert.deepEqual(data.bills,[realBill]);
  assert.deepEqual(data.charges,[realCharge]);
  assert.deepEqual(data.payments,[realPayment]);
  assert(!Object.hasOwn(data,'demoPayments'));
  for(const table of ['patient_bills','patient_medical_charges','patient_payments']) {
    const call=client.calls.find(row=>row.table===table);
    assert(call);
    assert(call.filters.some(([key,value])=>key==='is_demo'&&value===false));
    if(table!=='patient_bills') assert(call.filters.some(([key,value])=>key==='bill_id'&&value.includes('real-bill')));
  }
  assert(!client.calls.some(call=>call.table==='demo_payment_simulations'));
  assert(!client.calls.some(call=>call.table==='patient_bill_items'));
});

test('pagination returns records past the default API page limit',async()=>{
  const records=Array.from({length:1001},(_,id)=>({id,patient_id:patient}));
  assert.equal((await patientRows(fixture({appointments:records}),'appointments',patient)).length,1001);
});

test('related lookups skip null-like and malformed UUID values before Supabase .in queries',async()=>{
  const valid='00000000-0000-4000-8000-000000000002';
  const client=fixture({doctors:[{id:valid,display_name:'Fixture doctor'}]});
  const warnings=[];
  const warn=console.warn;
  console.warn=(...args)=>warnings.push(args);
  try {
    const doctors=await relatedRows(client,'doctors',[null,undefined,'','null','undefined','not-a-uuid',valid,valid]);
    assert.equal(doctors.length,1);
    assert.equal(client.calls.length,1);
    assert.deepEqual(client.calls[0].filters,[['id',[valid]]]);
    assert.equal(JSON.parse(warnings[0][1]).invalidIdCount,1);
  } finally {
    console.warn=warn;
  }
});

test('CBC aliases on the same Manila date merge without an explicit link and preserve booking status',()=>{
  const records=[{id:'r',category:'laboratory',title:'Complete Blood Count (CBC)',record_date:'2026-01-02T17:00:00Z',is_demo:true,status:'recorded'}];
  const bookings=[{id:'b',lab_test_id:'cbc',booking_date:'2026-01-03',status:'completed'}];
  const tests=[{id:'cbc',name:'CBC'}];
  const result=buildMedicalHistory(records,bookings,tests,[]);
  assert.equal(result.length,1);
  assert.equal(result[0].bookingStatus,'completed');
  assert.equal(result[0].resultAvailable,false);
  assert.match(result[0].description,/Laboratory booking: CBC/);
  assert.equal(records[0].lab_test_booking_id,undefined);
  assert.equal(bookings[0].medical_record_id,undefined);
  assert.equal(buildMedicalHistory(records,[{...bookings[0],booking_date:'2026-01-04'}],tests,[]).length,2);
  assert.equal(buildMedicalHistory(records,[...bookings,{...bookings[0],id:'second-booking'}],tests,[]).length,3);
});

test('Manila date keys are deterministic around UTC midnight and handle absent dates',()=>{
  assert.equal(patientDateKey('2026-01-02T17:00:00Z'),'2026-01-03');
  assert.equal(patientDateKey('2026-01-02'),'2026-01-02');
  assert.equal(patientDateKey(null),'');
  assert.equal(patientDateKey('invalid'),'');
});
