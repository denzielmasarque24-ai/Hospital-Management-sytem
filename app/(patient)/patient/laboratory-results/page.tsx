import { redirect } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { patientRows, relatedRows } from '@/lib/patient/queries.mjs';
import { formatPatientDate } from '@/lib/patient/dashboard.mjs';

export const dynamic = 'force-dynamic';
type Row = Record<string,any>;
export default async function LaboratoryResultsPage() {
  const client=await createSupabaseServerClient();
  if(!client)redirect('/login');
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user?.email_confirmed_at)redirect('/login');
  let content;
  try {
    const results:Row[]=(await patientRows(client,'patient_lab_results',user.id,'id,patient_id,lab_test_booking_id,lab_test_id,reviewed_by,result_title,result_summary,result_date,result_status,release_status,reviewed_at,released_by,released_at,is_demo',{orderBy:'result_date',ascending:false})).filter((row:Row)=>row.release_status==='released'&&row.reviewed_by&&row.reviewed_at&&row.released_by&&row.released_at);
    const [tests,bookings,documents]=await Promise.all([
      relatedRows(client,'lab_tests',results.map(row=>row.lab_test_id),'id,name'),
      relatedRows(client,'lab_test_bookings',results.map(row=>row.lab_test_booking_id),'id,booking_date'),
      results.length?patientRows(client,'patient_medical_documents',user.id,'id,lab_result_id,file_name,mime_type'):Promise.resolve([]),
    ]);
    content=results.length?<div className="patient-list">{results.map(row=><article className="patient-card" key={row.id}>
      <h2>{row.result_title}</h2>{row.is_demo&&<span className="patient-demo-badge">DEMO DATA</span>}
      <dl className="patient-detail-grid"><div><dt>Laboratory Test</dt><dd>{tests.find((test:Row)=>test.id===row.lab_test_id)?.name||'Laboratory test'}</dd></div><div><dt>Test Date</dt><dd>{formatPatientDate(bookings.find((booking:Row)=>booking.id===row.lab_test_booking_id)?.booking_date)||'Not recorded'}</dd></div><div><dt>Result Date</dt><dd>{formatPatientDate(row.result_date)}</dd></div><div><dt>Result Status</dt><dd>Reviewed and released</dd></div><div><dt>Review status</dt><dd>{row.reviewed_by?'Clinically reviewed':'Review details unavailable'}</dd></div></dl>
      <details><summary>View Result</summary><p style={{whiteSpace:'pre-wrap'}}>{row.result_summary||'See the attached report for result details.'}</p>{documents.filter((doc:Row)=>doc.lab_result_id===row.id).map((doc:Row)=><p key={doc.id}><span>{doc.file_name} </span><a className="patient-secondary-button" target="_blank" rel="noopener noreferrer" href={`/api/clinical/documents/${doc.id}`}>View Document</a>{' '}<a className="patient-secondary-button" href={`/api/clinical/documents/${doc.id}?download=1`}>{doc.mime_type==='application/pdf'?'Download PDF':'Download Image'}</a></p>)}</details>
    </article>)}</div>:<section className="patient-card patient-empty"><FlaskConical size={26}/><p>No laboratory results are available yet.</p></section>;
  } catch {
    content=<section className="patient-card patient-query-error" role="alert"><h2>Laboratory results could not be loaded</h2><p>Please retry. If this continues, contact the hospital.</p><a className="patient-secondary-button" href="/patient/laboratory-results">Try again</a></section>;
  }
  return <><header className="patient-page-heading patient-module-heading"><div><p className="patient-eyebrow">YOUR LABORATORY REPORTS</p><h1>My Laboratory Results</h1><p>Reviewed reports securely released by your care team.</p></div><FlaskConical size={54}/></header>{content}</>;
}
