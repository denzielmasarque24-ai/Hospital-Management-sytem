// Read-only live verification. Supply an existing short-lived patient access
// token through the process environment, never a password or service-role key.
// node --env-file=.env.local scripts/verify-patient-dashboard.mjs --expect-demo
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {loadPatientSection,patientRows} from '../lib/patient/queries.mjs';
import {buildMedicalHistory,isCurrentAdmission,isDemo,summarizeBills} from '../lib/patient/dashboard.mjs';

const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const token=process.env.DEMO_PATIENT_ACCESS_TOKEN;
if(!url || !key || !token) {
  console.error('Live verification requires the public Supabase settings and DEMO_PATIENT_ACCESS_TOKEN from an authorized patient session. No credentials were printed or saved.');
  process.exit(2);
}
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
try {
  const {data:{user},error}=await client.auth.getUser(token);
  assert(!error && user?.email_confirmed_at,'An authenticated, email-verified patient session is required.');
  const profile=await client.from('profiles').select('role').eq('id',user.id).single();
  assert(!profile.error && String(profile.data?.role).toUpperCase()==='PATIENT','This verifier requires a PATIENT role, not a staff or administrator session.');
  const results={};
  for(const section of ['assigned-doctor','medical-history','admissions','room-information','billing','medical-supplies']) {
    results[section]=await loadPatientSection(client,user.id,section);
    console.log(`PASS: ${section} database reads`);
  }
  const appointments=await patientRows(client,'appointments',user.id);
  const history=results['medical-history'];
  const timeline=buildMedicalHistory(history.records,history.bookings,history.tests,history.doctors);
  const bills=summarizeBills(results.billing.bills,results.billing.charges,results.billing.payments);
  // Deliberately omit the app's ownership filter to probe the database's RLS.
  // Only counts/outcomes are printed; no patient data or identities are logged.
  for(const table of ['appointments','patient_doctor_assignments','patient_medical_records','lab_test_bookings','patient_admissions','patient_bills','patient_medical_charges','patient_payments']) {
    for(let offset=0;;offset+=500) {
      const {data,error}=await client.from(table).select('id,patient_id').order('id').range(offset,offset+499);
      if(error) throw Object.assign(new Error('RLS read probe failed'),{table,code:error.code});
      assert(data.every(row=>row.patient_id===user.id),`RLS ownership violation: ${table}`);
      if(data.length<500) break;
    }
    console.log(`PASS: ${table} read isolation for records visible to this session`);
  }
  const summary={appointments:appointments.length,activeDoctorAssignments:results['assigned-doctor'].assignments.length,labBookings:history.bookings.length,medicalRecords:history.records.length,timelineEntries:timeline.length,admissions:results.admissions.admissions.length,currentAdmissions:results.admissions.admissions.filter(isCurrentAdmission).length,rooms:results['room-information'].rooms.length,bills:bills.length,payments:results.billing.payments.length,charges:results.billing.charges.length,supplies:results['medical-supplies'].charges.length};
  console.log(JSON.stringify(summary,null,2));
  if(process.argv.includes('--expect-demo')) {
    assert.equal(summary.appointments,3);
    assert.equal(summary.activeDoctorAssignments,1);
    assert.equal(summary.labBookings,1);
    assert.equal(summary.medicalRecords,3);
    assert(summary.admissions>=1 && summary.rooms>=1);
    assert.equal(summary.charges,5);
    assert.equal(summary.supplies,2);
    const demoBill=bills.find(row=>row.demo);
    assert(demoBill,'Demo invoice must be labeled');
    assert.equal(demoBill.total,3930);
    assert.equal(demoBill.paid,2000);
    assert.equal(demoBill.balance,1930);
    assert(history.records.every(isDemo),'All seeded fictional clinical records must carry a demo indicator');
    assert(results['room-information'].rooms.some(row=>row.room_number==='DEMO-R201'));
    console.log('PASS: expected demo record counts and invoice totals');
  }
  console.log('Read-only verification complete. Write-denial policies and browser interactions still require separate review.');
} catch(error) {
  // Avoid dumping Supabase response objects, tokens, or patient records.
  console.error('Verification failed:',error.table || 'assertion',error.code || error.message);
  process.exitCode=1;
}
