"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, FlaskConical, Plus, Search, Upload, ShieldCheck } from 'lucide-react';
import { AdminShell } from './AdminShell';
import { isValidUuid } from '@/lib/admin/billing-patient.mjs';
import './clinical-records.css';

type Row = Record<string, any>;
type Workspace = { patients: Row[]; records: Row[]; doctors: Row[]; tests: Row[]; bookings: Row[]; canAuthor: boolean; canRelease: boolean };
const empty: Workspace = { patients: [], records: [], doctors: [], tests: [], bookings: [], canAuthor: false, canRelease: false };
const date = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const label = (value: string) => value.replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
async function api(url: string, options?: RequestInit) {
  const response = await fetch(url,{ ...options, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'The clinical request failed.');
  return body;
}
function values(row: Row, lab: boolean) { return { title: row.title ?? row.result_title ?? '', description: row.description ?? row.result_summary ?? '', date: String(row.record_date ?? row.result_date ?? date()).slice(0,10), doctor_id: lab ? '' : row.doctor_id ?? '', record_type: row.record_type || 'consultation', test_id: row.lab_test_id || '', booking_id: row.lab_test_booking_id || '' }; }

export default function ClinicalRecordManager({ kind }: { kind: 'medical' | 'lab' }) {
  const lab = kind === 'lab', title = lab ? 'Laboratory Results' : 'Medical Records', Icon = lab ? FlaskConical : ClipboardList;
  const [workspace,setWorkspace] = useState<Workspace>(empty);
  const [search,setSearch] = useState(''), [patient,setPatient] = useState(''), [offset,setOffset] = useState(0);
  const [type,setType] = useState(''), [status,setStatus] = useState(''), [recordDate,setRecordDate] = useState('');
  const [selected,setSelected] = useState<Row|null>(null), [form,setForm] = useState(values({},lab));
  const [documents,setDocuments] = useState<Row[]>([]), [history,setHistory] = useState<Row[]>([]);
  const [reviewed,setReviewed] = useState(false), [file,setFile] = useState<File|null>(null);
  const [loading,setLoading] = useState(true), [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const request = useRef(0), detailRequest = useRef(0);
  useEffect(()=>{const requested=new URLSearchParams(window.location.search).get('patient');if(requested&&isValidUuid(requested))setPatient(requested);},[]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const version = ++request.current; setLoading(true); setError('');
    try {
      const result = await api(`/api/clinical?${new URLSearchParams({ kind, search, patient, offset: String(offset), type, status, date: recordDate })}`,{signal});
      if (version === request.current) setWorkspace(result);
    } catch (cause) { if (version === request.current && !signal?.aborted) { setWorkspace(empty); setError(cause instanceof Error ? cause.message : 'Records could not be loaded.'); } }
    finally { if (version === request.current && !signal?.aborted) setLoading(false); }
  },[kind,search,patient,offset,type,status,recordDate]);
  useEffect(()=>{setWorkspace(current=>({...current,records:[],bookings:[]}));setLoading(true);const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal),250);return()=>{clearTimeout(timer);controller.abort();request.current+=1;};},[load]);
  const details = useCallback(async (id: string) => {
    const version=++detailRequest.current;
    try { const result=await api(`/api/clinical/documents?kind=${kind}&record=${id}`);if(version===detailRequest.current){setDocuments(result.documents||[]);setHistory(result.history||[]);} }
    catch(cause){if(version===detailRequest.current)setError(cause instanceof Error?cause.message:'Documents could not be loaded.');}
  },[kind]);
  function close() { detailRequest.current+=1;setSelected(null);setDocuments([]);setHistory([]);setFile(null);setReviewed(false); }
  function open(row: Row) { if(row.created_at){setPatient(row.patient_id);setOffset(0);} close();setError('');setNotice('');setSelected(row);setForm(values(row,lab));if(row.created_at)void details(row.id); }
  const draft = selected?.delivery_state === 'draft' && !selected?.is_demo;
  const dirty = selected && JSON.stringify(form)!==JSON.stringify(values(selected,lab));
  async function mutate(action: string) {
    if (!selected || busy) return;
    if(action==='release' && !window.confirm('Release this reviewed record to the selected patient? Released records are locked.'))return;
    setBusy(true);setError('');setNotice('');
    try {
      const saved=await api('/api/clinical',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id:selected.id,patient:selected.patient_id,action,values:form,expected:selected.updated_at||null})});
      setSelected(saved);setForm(values(saved,lab));setReviewed(false);
      await load();await details(saved.id);
      setNotice(action==='release'?'Released to the patient. A portal notification was created.':action==='review'?'Clinical review recorded. The record is ready for release.':action==='return_to_draft'?'Returned to draft. Review is required again after changes.':'Draft saved.');
    } catch(cause){setError(cause instanceof Error?cause.message:'The record could not be saved.');}
    finally{setBusy(false);}
  }
  async function upload() {
    if(!selected||!file||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const payload=new FormData();payload.set('kind',kind);payload.set('record',selected.id);payload.set('patient',selected.patient_id);payload.set('file',file);
      const result=await api('/api/clinical/documents',{method:'POST',body:payload});
      if(result.record){setSelected(result.record);setForm(values(result.record,lab));}
      setFile(null);await details(selected.id);await load();setNotice('Document uploaded privately. It will be available to the patient only after release.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Upload failed.');}finally{setBusy(false);}
  }
  const visible=workspace.records.filter(row=>(!type||row.record_type===type)&&(!status||row.delivery_state===status)&&(!recordDate||String(row.record_date??row.result_date).slice(0,10)===recordDate));
  const disabled=busy||!workspace.canAuthor||!draft;
  return <AdminShell title={title} patientAccessOnly><div className="clinical-manager">
    <header className="ad-page-header"><div><h1><Icon size={25}/> {title}</h1><p>{lab?'Manage reviewed laboratory reports and secure patient delivery.':'Manage patient history, clinical review, and secure record release.'}</p></div><button type="button" className="ad-btn ad-btn-primary" disabled={!patient||!workspace.canAuthor||busy||loading} onClick={()=>open({id:crypto.randomUUID(),patient_id:patient,delivery_state:'draft'})}><Plus size={16}/>Add {lab?'Lab Result':'Medical Record'}</button></header>
    {error&&<div className="ad-content-alert error" role="alert">{error}</div>}{notice&&<div className="clinical-notice" role="status">{notice}</div>}
    <section className="ad-card clinical-controls" aria-label="Patient and record filters">
      <label><span><Search size={15}/>Search patient name</span><input type="search" value={search} disabled={busy} onChange={e=>{setSearch(e.target.value);setOffset(0);close();}} placeholder="Search registered patients"/></label>
      <label>Select Patient<select value={patient} disabled={busy} onChange={e=>{setPatient(e.target.value);setOffset(0);close();}}><option value="">All patients</option>{workspace.patients.map(row=><option key={row.id} value={row.id}>{row.full_name} · {row.id}</option>)}</select></label>
      {!lab&&<label>Record Type<select value={type} onChange={e=>{setType(e.target.value);setOffset(0);}}><option value="">All types</option>{['consultation','check_up','diagnostic'].map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>}
      <label>Status<select value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="">All statuses</option>{['legacy','draft','reviewed','released'].map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>
      <label>Record Date<input type="date" value={recordDate} onChange={e=>{setRecordDate(e.target.value);setOffset(0);}}/></label>
      <button type="button" className="ad-btn ad-btn-ghost" disabled={busy||loading} onClick={()=>void load()}>Refresh</button>
    </section>
    {lab&&patient&&<section className="ad-card clinical-bookings"><h2>Patient laboratory bookings</h2>{workspace.bookings.length?<ul>{workspace.bookings.map(row=><li key={row.id}><strong>{row.name||'Laboratory test'}</strong> · {row.booking_date} {String(row.booking_time||'').slice(0,5)} · {label(row.status||'pending')}</li>)}</ul>:<p>No laboratory bookings found for this patient.</p>}</section>}
    <section className="ad-card"><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>Patient</th><th>{lab?'Lab Test':'Record Type'}</th><th>{lab?'Reviewed':'Doctor'}</th><th>Date</th><th>Review Status</th><th>Release Status</th><th>Actions</th></tr></thead><tbody>
      {visible.map(row=><tr key={row.id}><td>{row.patient_name||'Name not provided'}{row.is_demo&&<span className="clinical-badge">Demo history</span>}</td><td>{lab?row.lab_test_name||row.result_title:label(row.record_type||'Medical record')}<small className="clinical-secondary">{row.title||row.result_title}</small></td><td>{lab?(row.reviewed_by?'Reviewed':'Not reviewed'):(row.doctor_name||'Not assigned')}</td><td>{String(row.record_date??row.result_date??'').slice(0,10)}</td><td><span className={`clinical-badge state-${row.delivery_state}`}>{label(row.delivery_state||'legacy')}</span></td><td>{row.released_at||row.delivery_state==='legacy'&&row.result_status==='released'?'Released':'Not released'}</td><td><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy} onClick={()=>open(row)}>View / Manage</button></td></tr>)}
      {!visible.length&&<tr><td colSpan={7}>{loading?'Loading records…':error?'Records are unavailable. See the message above.':'No records match these filters.'}</td></tr>}
    </tbody></table></div><footer className="clinical-pagination"><span>Up to 50 matching records per page.</span><button className="ad-btn ad-btn-ghost" disabled={offset===0||busy||loading} onClick={()=>{setOffset(Math.max(0,offset-50));close();}}>Previous</button><button className="ad-btn ad-btn-ghost" disabled={workspace.records.length<50||busy||loading} onClick={()=>{setOffset(offset+50);close();}}>Next</button></footer></section>
    {selected&&<section className="ad-card clinical-editor" aria-label="Manage clinical record"><header><div><h2>{selected.created_at?'Record details':'New draft'}</h2><p>Patient: {workspace.patients.find(row=>row.id===selected.patient_id)?.full_name||selected.patient_name||selected.patient_id}</p><small>{selected.id}</small></div><button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={close}>Close</button></header>
      {selected.is_demo&&<p className="clinical-notice">Demo history is preserved and cannot be released as a real clinical record.</p>}
      <form onSubmit={e=>{e.preventDefault();void mutate('save');}}><fieldset disabled={disabled}><div className="clinical-form-grid">
        <label>{lab?'Result Title':'Record Title'}<input required maxLength={200} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
        <label>{lab?'Result Date':'Record Date'}<input required type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
        {!lab&&<label>Record Type<select value={form.record_type} onChange={e=>setForm({...form,record_type:e.target.value})}>{['consultation','check_up','diagnostic'].map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label>}
        {!lab&&<label>Attending Doctor<select value={form.doctor_id} onChange={e=>setForm({...form,doctor_id:e.target.value})}><option value="">Not assigned</option>{form.doctor_id&&!workspace.doctors.some(row=>row.id===form.doctor_id)&&<option value={form.doctor_id}>{selected.doctor_name||'Historical doctor'}</option>}{workspace.doctors.map(row=><option key={row.id} value={row.id}>{row.display_name}{row.specialty?` · ${row.specialty}`:''}</option>)}</select></label>}
        {lab&&<><label>Laboratory Test<select required value={form.test_id} onChange={e=>setForm({...form,test_id:e.target.value,booking_id:''})}><option value="">Select test</option>{workspace.tests.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Related Booking<select value={form.booking_id} onChange={e=>{const booking=workspace.bookings.find(row=>row.id===e.target.value);setForm({...form,booking_id:e.target.value,test_id:booking?.lab_test_id||form.test_id});}}><option value="">No booking link</option>{workspace.bookings.map(row=><option key={row.id} value={row.id}>{row.name} · {row.booking_date} · {row.status}</option>)}</select></label></>}
        <label className="clinical-wide">{lab?'Test Results / Summary':'Description'}<textarea rows={5} maxLength={20000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
      </div></fieldset><div className="clinical-actions">{workspace.canAuthor&&draft&&<button className="ad-btn ad-btn-primary" type="submit" disabled={busy}>{busy?'Working…':'Save Draft'}</button>}<span>Review: {label(selected.delivery_state||'draft')} · {selected.released_at?`Released ${new Date(selected.released_at).toLocaleString('en-PH')}`:'Not released'}</span></div></form>
      {selected.created_at&&<><section className="clinical-documents"><h3><Upload size={17}/> Private medical documents</h3>{documents.map(doc=><div className="clinical-document" key={doc.id}><span>{doc.file_name} · {(doc.file_size/1024).toFixed(0)} KB</span><a target="_blank" rel="noopener noreferrer" href={`/api/clinical/documents/${doc.id}`}>View Document</a><a href={`/api/clinical/documents/${doc.id}?download=1`}>Download</a></div>)}{!documents.length&&<p>No documents attached.</p>}{draft&&workspace.canAuthor&&<div className="clinical-actions"><label>PDF, JPG, JPEG or PNG · maximum 10 MB<input key={`${selected.id}-${documents.length}`} type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy||Boolean(dirty)} onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button type="button" className="ad-btn ad-btn-ghost" disabled={busy||!file||Boolean(dirty)} onClick={()=>void upload()}>Upload document</button></div>}</section>
        {workspace.canRelease&&!selected.is_demo&&<section className="clinical-review"><h3><ShieldCheck size={18}/> Clinical review and patient release</h3>{['draft','legacy'].includes(selected.delivery_state)&&<><label className="clinical-approval"><input type="checkbox" checked={reviewed} disabled={busy||Boolean(dirty)} onChange={e=>setReviewed(e.target.checked)}/>I have reviewed the findings, patient identity, assigned doctor, and all attachments, and approve this record for patient release.</label><button type="button" className="ad-btn ad-btn-primary" disabled={!reviewed||busy||Boolean(dirty)} onClick={()=>void mutate('review')}>Mark as Reviewed</button></>}{selected.delivery_state==='reviewed'&&<div className="clinical-actions"><button type="button" className="ad-btn ad-btn-primary" disabled={busy} onClick={()=>void mutate('release')}>{lab?'Release Lab Result':'Release to Patient'}</button><button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={()=>void mutate('return_to_draft')}>Return to Draft</button></div>}</section>}
        {history.length>0&&<section><h3>Record History</h3><ol className="clinical-history">{history.map(event=><li key={event.id}><strong>{label(event.action)}</strong> · {new Date(event.occurred_at).toLocaleString('en-PH')}<small>Staff reference: {event.actor_id||'System'}</small></li>)}</ol></section>}
      </>}
    </section>}
  </div></AdminShell>;
}
