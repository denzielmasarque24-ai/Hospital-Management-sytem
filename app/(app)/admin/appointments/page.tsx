"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/lib/supabase/client";

type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";
type Appointment = { id:string;patient_id:string;doctor_id:string|null;service_id:string|null;appointment_date:string;appointment_time:string;status:AppointmentStatus;notes:string|null;created_at:string;patient_display_name:string;service_name:string;service_description:string;doctor_name:string;doctor_specialty:string;doctor_department:string };
type AppointmentRow=Omit<Appointment,"patient_display_name"|"service_name"|"service_description"|"doctor_name"|"doctor_specialty"|"doctor_department">;
type Profile={id:string;first_name:string|null;middle_name:string|null;last_name:string|null;suffix:string|null};
type Doctor={id:string;display_name:string|null;specialty:string|null;department:string|null};
type Service={id:string;name:string;description:string|null};
type ChangeRequest={id:string;appointment_id:string;patient_id:string;request_type:"reschedule"|"cancellation";requested_date:string|null;requested_time:string|null;reason:string;status:"pending"|"approved"|"declined";created_at:string};
const statuses:Array<AppointmentStatus|"all">=["all","pending","confirmed","completed","cancelled"];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid=(value:unknown)=>typeof value==="string"&&UUID.test(value.trim())?value.trim().toLowerCase():null;
const fullName=(person?:Profile)=>person?[person.first_name,person.middle_name,person.last_name,person.suffix].filter(part=>part?.trim()).join(" ")||"Name not provided":"Name not provided";
const errorMessage=(error:{code?:string;message?:string;details?:string;hint?:string})=>`${error.code?`(${error.code}) `:""}${error.message||"Unknown database error"}${error.details?` ${error.details}`:""}${error.hint?` Hint: ${error.hint}`:""}`;
const dateTime=(date:string,time:string)=>new Date(`${date}T${time||"00:00"}+08:00`).toLocaleString("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"});

export default function AdminAppointmentsPage(){
  const [rows,setRows]=useState<Appointment[]>([]),[requests,setRequests]=useState<ChangeRequest[]>([]);
  const [loading,setLoading]=useState(true),[savingId,setSavingId]=useState<string|null>(null),[reviewingId,setReviewingId]=useState<string|null>(null);
  const [error,setError]=useState(""),[notice,setNotice]=useState(""),[query,setQuery]=useState(""),[status,setStatus]=useState<AppointmentStatus|"all">("all"),[date,setDate]=useState(""),[page,setPage]=useState(0),[selected,setSelected]=useState<Appointment|null>(null);

  const load=useCallback(async()=>{
    if(!supabase){setError("Supabase is not configured.");setLoading(false);return;}
    setLoading(true);setError("");
    const appointmentRows:AppointmentRow[]=[];
    for(let from=0;;from+=500){
      const {data,error:queryError}=await supabase.from("appointments").select("id,patient_id,doctor_id,service_id,appointment_date,appointment_time,status,notes,created_at").order("appointment_date",{ascending:true}).order("appointment_time",{ascending:true}).range(from,from+499);
      if(queryError){console.error("[AdminAppointments] Appointment query failed",queryError);setError(`Appointments could not be loaded: ${errorMessage(queryError)}`);setLoading(false);return;}
      appointmentRows.push(...((data||[]) as AppointmentRow[]));if(!data||data.length<500)break;
    }
    const ids=(values:unknown[])=>[...new Set(values.map(uuid).filter((value):value is string=>Boolean(value)))];
    const patientIds=ids(appointmentRows.map(row=>row.patient_id)),serviceIds=ids(appointmentRows.map(row=>row.service_id)),doctorIds=ids(appointmentRows.map(row=>row.doctor_id)),appointmentIds=ids(appointmentRows.map(row=>row.id));
    const [profilesResult,servicesResult,doctorsResult,requestsResult]=await Promise.all([
      patientIds.length?supabase.from("profiles").select("id,first_name,middle_name,last_name,suffix").in("id",patientIds):Promise.resolve({data:[],error:null}),
      serviceIds.length?supabase.from("services").select("id,name,description").in("id",serviceIds):Promise.resolve({data:[],error:null}),
      doctorIds.length?supabase.from("doctors").select("id,display_name,specialty,department").in("id",doctorIds):Promise.resolve({data:[],error:null}),
      appointmentIds.length?supabase.from("patient_appointment_change_requests").select("id,appointment_id,patient_id,request_type,requested_date,requested_time,reason,status,created_at").in("appointment_id",appointmentIds).order("created_at",{ascending:false}):Promise.resolve({data:[],error:null}),
    ]);
    const lookupErrors=[profilesResult.error&&`Patient names: ${errorMessage(profilesResult.error)}`,servicesResult.error&&`Services: ${errorMessage(servicesResult.error)}`,doctorsResult.error&&`Doctors: ${errorMessage(doctorsResult.error)}`,requestsResult.error&&`Change requests: ${errorMessage(requestsResult.error)}`].filter(Boolean);
    if(lookupErrors.length)setError(`Appointments loaded with related-data issues. ${lookupErrors.join(" · ")}`);
    const profileMap=new Map(((profilesResult.data||[]) as Profile[]).map(item=>[uuid(item.id)||item.id,item]));
    const serviceMap=new Map(((servicesResult.data||[]) as Service[]).map(item=>[uuid(item.id)||item.id,item]));
    const doctorMap=new Map(((doctorsResult.data||[]) as Doctor[]).map(item=>[uuid(item.id)||item.id,item]));
    setRows(appointmentRows.map(row=>{
      const profile=profileMap.get(uuid(row.patient_id)||row.patient_id),service=row.service_id?serviceMap.get(uuid(row.service_id)||row.service_id):undefined,doctor=row.doctor_id?doctorMap.get(uuid(row.doctor_id)||row.doctor_id):undefined;
      return {...row,patient_display_name:fullName(profile),service_name:row.service_id?service?.name||"Service details unavailable":"Service not specified",service_description:service?.description||"",doctor_name:row.doctor_id?doctor?.display_name||"Doctor details unavailable":"No preference",doctor_specialty:doctor?.specialty||"",doctor_department:doctor?.department||""};
    }));
    setRequests((requestsResult.data||[]) as ChangeRequest[]);setLoading(false);
  },[]);

  useEffect(()=>{void load();if(!supabase)return;const client=supabase;const channel=client.channel("admin-appointments-sync").on("postgres_changes",{event:"*",schema:"public",table:"appointments"},()=>void load()).on("postgres_changes",{event:"*",schema:"public",table:"patient_appointment_change_requests"},()=>void load()).subscribe();return()=>{void client.removeChannel(channel);};},[load]);
  useEffect(()=>{const patientId=new URLSearchParams(window.location.search).get("patient");if(patientId)setQuery(patientId);},[]);

  const filtered=useMemo(()=>{const needle=query.trim().toLowerCase();return rows.filter(row=>(status==="all"||row.status===status)&&(!date||row.appointment_date===date)&&(!needle||[row.patient_display_name,row.service_name,row.doctor_name,row.doctor_specialty,row.doctor_department,row.patient_id].some(value=>value.toLowerCase().includes(needle))));},[rows,query,status,date]);
  useEffect(()=>setPage(0),[query,status,date]);
  const pageSize=20,pageRows=filtered.slice(page*pageSize,(page+1)*pageSize),pages=Math.max(1,Math.ceil(filtered.length/pageSize));

  const updateStatus=async(appointment:Appointment,nextStatus:AppointmentStatus)=>{
    if(!supabase||savingId)return;setSavingId(appointment.id);setError("");setNotice("");
    const {data,error:updateError}=await supabase.from("appointments").update({status:nextStatus}).eq("id",appointment.id).select("id,status").maybeSingle();
    if(updateError){setError(`Appointment status could not be updated: ${errorMessage(updateError)}`);}else if(!data){setError("The appointment was not updated. Check your appointment management permission and refresh.");}else{setNotice(`Appointment status updated to ${data.status}.`);window.dispatchEvent(new Event("medwell:appointments-updated"));await load();}
    setSavingId(null);
  };
  const reviewRequest=async(request:ChangeRequest,decision:"approved"|"declined")=>{
    if(!supabase||reviewingId)return;setReviewingId(request.id);setError("");setNotice("");
    try{
      const {error:reviewError}=await supabase.rpc("admin_review_appointment_change_request",{p_request_id:request.id,p_decision:decision});
      if(reviewError)throw reviewError;
      setNotice(`Appointment change request ${decision}.`);window.dispatchEvent(new Event("medwell:appointments-updated"));await load();
    }catch(cause){setError(`Change request could not be reviewed: ${errorMessage(cause as {code?:string;message?:string;details?:string;hint?:string})}`);await load();}
    finally{setReviewingId(null);}
  };

  return <AdminShell title="Appointments" adminOnly>
    <div className="ad-page-header"><div><h1>Appointments</h1><p>Review and update patient appointment requests.</p></div><button type="button" className="ad-btn ad-btn-ghost" onClick={()=>void load()} disabled={loading}>{loading?"Refreshing…":"Refresh"}</button></div>
    <div className="ad-card">
      <div className="ad-toolbar" style={{flexWrap:"wrap"}}><input className="ad-input" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search patient, service, doctor, or ID" aria-label="Search appointments"/><select className="ad-select" style={{width:"auto"}} value={status} onChange={event=>setStatus(event.target.value as AppointmentStatus|"all")} aria-label="Filter appointment status">{statuses.map(item=><option key={item} value={item}>{item==="all"?"All statuses":item[0].toUpperCase()+item.slice(1)}</option>)}</select><label style={{display:"flex",alignItems:"center",gap:8}}>Date<input className="ad-input" type="date" value={date} onChange={event=>setDate(event.target.value)} aria-label="Filter appointment date"/></label></div>
      {error&&<p role="alert" style={{color:"#b91c1c",padding:"0 16px 12px"}}>{error}</p>}{notice&&<p role="status" style={{color:"#166534",padding:"0 16px 12px"}}>{notice}</p>}
      {loading?<p role="status" style={{padding:20}}>Loading appointments…</p>:<div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>Patient</th><th>Service</th><th>Doctor</th><th>Date &amp; Time</th><th>Status</th><th>Change Requests</th><th>Actions</th></tr></thead><tbody>
        {pageRows.map(appointment=>{const appointmentRequests=requests.filter(request=>request.appointment_id===appointment.id);return <tr key={appointment.id}><td><strong>{appointment.patient_display_name}</strong><div style={{color:"var(--ad-muted)",fontSize:11}}>ID {appointment.patient_id}</div></td><td>{appointment.service_name}{appointment.service_description&&<div style={{color:"var(--ad-muted)",fontSize:11}}>{appointment.service_description}</div>}</td><td>{appointment.doctor_name}{appointment.doctor_specialty&&<div style={{color:"var(--ad-muted)",fontSize:11}}>{appointment.doctor_specialty}</div>}{appointment.doctor_department&&<div style={{color:"var(--ad-muted)",fontSize:11}}>{appointment.doctor_department}</div>}</td><td>{dateTime(appointment.appointment_date,appointment.appointment_time)}</td><td><span className={`ad-badge ${appointment.status==="confirmed"?"ad-badge-green":appointment.status==="completed"?"ad-badge-blue":appointment.status==="cancelled"?"ad-badge-gray":"ad-badge-yellow"}`}>{appointment.status}</span></td><td>{appointmentRequests.length?appointmentRequests.map(request=><div key={request.id} style={{marginBottom:8}}><strong>{request.request_type}</strong> · {request.status}{request.requested_date&&<div>{dateTime(request.requested_date,request.requested_time||"00:00")}</div>}{request.reason&&<small>{request.reason}</small>}{request.status==="pending"&&<div style={{display:"flex",gap:5,marginTop:5}}><button className="ad-btn ad-btn-primary ad-btn-sm" type="button" disabled={reviewingId!==null} onClick={()=>void reviewRequest(request,"approved")}>Approve</button><button className="ad-btn ad-btn-ghost ad-btn-sm" type="button" disabled={reviewingId!==null} onClick={()=>void reviewRequest(request,"declined")}>Decline</button></div>}</div>):"None"}</td><td><div style={{display:"flex",flexWrap:"wrap",gap:6}}><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={()=>setSelected(appointment)}>View details</button>{appointment.status==="pending"&&<><button type="button" className="ad-btn ad-btn-primary ad-btn-sm" disabled={savingId!==null} onClick={()=>void updateStatus(appointment,"confirmed")}>Confirm</button><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={savingId!==null} onClick={()=>void updateStatus(appointment,"cancelled")}>Cancel</button></>}{appointment.status==="confirmed"&&<><button type="button" className="ad-btn ad-btn-primary ad-btn-sm" disabled={savingId!==null} onClick={()=>void updateStatus(appointment,"completed")}>Mark completed</button><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={savingId!==null} onClick={()=>void updateStatus(appointment,"cancelled")}>Cancel</button></>}</div></td></tr>;})}
        {!pageRows.length&&<tr><td colSpan={7}><div className="ad-empty"><h3>{filtered.length?"No appointments on this page":"No matching appointments"}</h3><p>Appointment requests will appear here when available.</p></div></td></tr>}
      </tbody></table></div>}
      {!loading&&filtered.length>0&&<div className="ad-toolbar" style={{justifyContent:"space-between"}}><span>Showing {page*pageSize+1}–{Math.min((page+1)*pageSize,filtered.length)} of {filtered.length}</span><div style={{display:"flex",gap:8}}><button className="ad-btn ad-btn-ghost ad-btn-sm" type="button" disabled={page===0} onClick={()=>setPage(current=>current-1)}>Previous</button><span style={{alignSelf:"center"}}>Page {page+1} of {pages}</span><button className="ad-btn ad-btn-ghost ad-btn-sm" type="button" disabled={page+1>=pages} onClick={()=>setPage(current=>current+1)}>Next</button></div></div>}
    </div>
    {selected&&<div role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setSelected(null);}} style={{position:"fixed",inset:0,zIndex:1000,display:"grid",placeItems:"center",padding:16,background:"#0f243966"}}><section role="dialog" aria-modal="true" aria-labelledby="appointment-details-title" className="ad-card" style={{width:"min(620px,100%)",maxHeight:"85vh",overflow:"auto",padding:22}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2 id="appointment-details-title">Appointment details</h2><button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={()=>setSelected(null)}>Close</button></div><dl style={{display:"grid",gridTemplateColumns:"minmax(120px,1fr) 2fr",gap:"10px 16px"}}><dt>Appointment ID</dt><dd>{selected.id}</dd><dt>Patient</dt><dd>{selected.patient_display_name}</dd><dt>Patient ID</dt><dd>{selected.patient_id}</dd><dt>Service</dt><dd>{selected.service_name}{selected.service_description?` · ${selected.service_description}`:""}</dd><dt>Doctor</dt><dd>{selected.doctor_name}</dd><dt>Specialty</dt><dd>{selected.doctor_specialty||"Not listed"}</dd><dt>Department</dt><dd>{selected.doctor_department||"Not listed"}</dd><dt>Date and time</dt><dd>{dateTime(selected.appointment_date,selected.appointment_time)}</dd><dt>Status</dt><dd>{selected.status}</dd><dt>Notes</dt><dd>{selected.notes||"Not provided"}</dd></dl></section></div>}
  </AdminShell>;
}
