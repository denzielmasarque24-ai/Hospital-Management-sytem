"use client";

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { chargeLabel, validDecimal, validBillingDate } from '@/lib/admin/billing-validation.mjs';

export type BillingAuthorization = {
  id: string; category: string; description: string; quantity: number|string; unit_price: number|string; supporting_reason: string;
  service_id?: string|null; doctor_id?: string|null; consultation_record_id?: string|null; care_record_id?: string|null;
  admission_id?: string|null; room_id?: string|null; period_start?: string|null; period_end?: string|null; service_date: string;
  used_bill_id?: string|null;
};
type Option = Record<string,any>;
const initial = () => ({category:'hospital_service',description:'',quantity:'1',unit_price:'',supporting_reason:'',service_id:'',care_record_id:'',doctor_id:'',admission_id:'',service_date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),period_start:'',period_end:''});

export function BillingAuthorizations({patientId,approvals,canApprove,billId,services,consultations,admissions,onRefresh,onAdd,disabled=false}:{patientId:string;approvals:BillingAuthorization[];canApprove:boolean;billId:string|null;services:Option[];consultations:Option[];admissions:Option[];onRefresh:()=>Promise<void>;onAdd:(approval:BillingAuthorization)=>void;disabled?:boolean}) {
  const [form,setForm]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const reference=useRef<string|null>(null),inFlight=useRef(false);
  const available=approvals.filter(item=>!item.used_bill_id||item.used_bill_id===billId);
  const genuineAdmissions=admissions.filter(item=>item.is_demo===false&&!item.demo_key&&item.room_id&&item.room?.is_demo===false);
  function update(values:Partial<ReturnType<typeof initial>>) {setForm(old=>({...old,...values}));setError('');}
  async function approve() {
    if(!supabase||busy||inFlight.current||disabled)return;
    if(!form.description.trim()){setError('Financial authorization: Description is required.');return;}
    if(!validDecimal(form.quantity,3,true,'100000')){setError('Financial authorization: Quantity must be positive with at most 3 decimal places.');return;}
    if(!validDecimal(form.unit_price,2)){setError('Financial authorization: Enter an independently verified unit price with at most 2 decimal places.');return;}
    if(!form.supporting_reason.trim()){setError('Financial authorization: Document the approved price source and the basis for this charge.');return;}
    if(!validBillingDate(form.service_date)){setError('Financial authorization: A valid service date is required.');return;}
    if(['hospital_service','consultation','laboratory','diagnostic'].includes(form.category)&&!form.care_record_id){setError('Financial authorization: A genuine verified care record is required.');return;}
    if(form.category==='hospital_service'&&!form.service_id){setError('Hospital service: Select the service that was provided.');return;}
    if(form.category==='room'&&(!form.admission_id||!validBillingDate(form.period_start)||!validBillingDate(form.period_end))){setError('Room charge: Select a genuine admission and verified stay dates.');return;}
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try {
      reference.current??=crypto.randomUUID();
      const {error:approvalError}=await supabase.rpc('billing_approve_charge',{p_id:reference.current,p_patient_id:patientId,p_values:form});
      if(approvalError)throw approvalError;
      reference.current=null;setForm(initial());await onRefresh();setNotice('Financial authorization recorded. Add the approved charge below.');
    }catch(cause){setError((cause as {message?:string})?.message||'Financial authorization could not be recorded.');}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <section className="mw-bill-card mw-financial-authorizations"><div className="mw-bill-section-head"><div><h2>Verified Charge Authorizations</h2><p>Catalog products use their approved catalog price. Other charges require a documented, patient-specific financial authorization.</p></div><button type="button" className="mw-bill-secondary" disabled={disabled||busy} onClick={()=>void onRefresh().catch(()=>setError('Financial authorizations could not be refreshed.'))}>Refresh approvals</button></div>
    {error&&<p className="mw-billing-alert error" role="alert">{error}</p>}{notice&&<p className="mw-billing-alert success" role="status">{notice}</p>}
    {!available.some(item=>item.category==='room')&&<p className="mw-bill-empty">Room charge: Adding a room charge is disabled until an independently verified room rate, documented charge basis, and genuine stay dates are approved. Historical and demo assignments do not create charges.</p>}
    <div className="mw-approved-charge-list">{available.map(item=><div key={item.id}><span><strong>{item.description}</strong><small>{chargeLabel(item.category)} · {item.quantity} × ₱{Number(item.unit_price).toFixed(2)}{item.period_start?` · ${item.period_start} to ${item.period_end}`:''}</small><small>Basis: {item.supporting_reason}</small></span><button type="button" className="mw-bill-secondary" disabled={disabled||busy} onClick={()=>onAdd(item)}>Add Approved Charge</button></div>)}</div>
    {!available.length&&<p className="mw-bill-empty">No unused financial authorizations are available for this patient.</p>}
    {canApprove?<details><summary>Approve a verified non-product charge</summary><p className="mw-bill-empty">Financial approval does not establish clinical findings. Review the verified care/stay record and documented price source before authorizing a real charge. Room rates and physician assignments are display information until explicitly verified here.</p><form className="mw-approval-form" onSubmit={event=>{event.preventDefault();void approve();}}><fieldset disabled={busy||disabled}>
      <label>Authorized category<select value={form.category} onChange={e=>{reference.current=null;setForm({...initial(),category:e.target.value});}}>{['hospital_service','consultation','room','other','laboratory','diagnostic'].map(value=><option key={value} value={value}>{chargeLabel(value)}</option>)}</select></label>
      <label>Description<input required maxLength={500} value={form.description} onChange={e=>update({description:e.target.value})}/></label>
      {form.category==='hospital_service'&&<label>Service provided<select required value={form.service_id} onChange={e=>{const selected=services.find(item=>item.id===e.target.value);update({service_id:e.target.value,description:selected?.name||form.description});}}><option value="">Select service</option>{services.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {['hospital_service','consultation','laboratory','diagnostic'].includes(form.category)&&<label>Verified care record<select required value={form.care_record_id} onChange={e=>{const selected=consultations.find(item=>item.record_id===e.target.value);update({care_record_id:e.target.value,doctor_id:form.category==='consultation'?selected?.doctor_id||'':'',description:form.category==='consultation'?`${selected?.reason||'Consultation'} — ${selected?.doctor_name||'Doctor'}`:form.description});}}><option value="">Select genuine verified care</option>{consultations.map(item=><option key={item.record_id} value={item.record_id}>{item.reason||item.record_type} · {item.doctor_name} · {item.occurred_at.slice(0,10)}</option>)}</select></label>}
      {form.category==='room'&&<><label>Genuine admission<select required value={form.admission_id} onChange={e=>update({admission_id:e.target.value})}><option value="">Select admission</option>{genuineAdmissions.map(item=><option key={item.id} value={item.id}>{item.id} · Room {item.room.room_number} · {item.status}</option>)}</select></label><label>Stay start<input required type="date" value={form.period_start} onChange={e=>update({period_start:e.target.value})}/></label><label>Stay end<input required type="date" value={form.period_end} onChange={e=>update({period_end:e.target.value})}/></label></>}
      <label>Service date<input required type="date" value={form.service_date} onChange={e=>update({service_date:e.target.value})}/></label>
      <label>{form.category==='room'?'Verified billable days':'Approved quantity'}<input required inputMode="decimal" value={form.quantity} onChange={e=>update({quantity:e.target.value})}/></label>
      <label>{form.category==='room'?'Independently verified daily rate':'Verified unit price'}<input required inputMode="decimal" placeholder="Approved amount, to cents" value={form.unit_price} onChange={e=>update({unit_price:e.target.value})}/></label>
      <label className="mw-approval-basis">Documented price source / authorization basis<textarea required maxLength={2000} value={form.supporting_reason} placeholder="Reference the approved fee, rate confirmation, and care delivery or stay basis" onChange={e=>update({supporting_reason:e.target.value})}/></label>
      <button type="submit" className="mw-bill-secondary">{busy?'Recording approval…':'Approve Verified Charge'}</button>
    </fieldset></form></details>:<p className="mw-bill-empty">An authorized hospital administrator must approve non-product prices and their documented billing basis.</p>}
  </section>;
}
