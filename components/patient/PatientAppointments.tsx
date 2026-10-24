"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock3, Stethoscope } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

type Appointment = { id: string; service_name: string; department: string; doctor: string | null; preferred_date: string; preferred_time: string; reason: string; status: string; created_at: string; specialty?: string; service_details?: string; is_demo?: boolean };
type Request = { id: string; appointment_id: string; request_type: string; requested_date: string | null; requested_time: string | null; reason: string; status: string; created_at: string };
const dateTime = (date: string, time: string) => new Date(`${date}T${time}+08:00`).toLocaleString("en-PH", { timeZone:"Asia/Manila", dateStyle: "medium", timeStyle: "short" });

export default function PatientAppointments({ patientId, appointments, requests: initialRequests, requestsError }: { patientId: string; appointments: Appointment[]; requests: Request[]; requestsError: string }) {
  const router=useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [error, setError] = useState(requestsError);
  const [busyId, setBusyId] = useState("");
  const requestInFlight=useRef(false);
  const [filter,setFilter]=useState("All appointments");
  useEffect(()=>setRequests(initialRequests),[initialRequests]);
  useEffect(()=>{
    if(!supabase)return;
    const client=supabase;
    const refresh=()=>router.refresh();
    const channel=client.channel(`patient-appointments-${patientId}`).on("postgres_changes",{event:"*",schema:"public",table:"appointments",filter:`patient_id=eq.${patientId}`},refresh).on("postgres_changes",{event:"*",schema:"public",table:"patient_appointment_change_requests",filter:`patient_id=eq.${patientId}`},refresh).subscribe();
    window.addEventListener("focus",refresh);
    return()=>{window.removeEventListener("focus",refresh);void client.removeChannel(channel);};
  },[patientId,router]);
  const now = new Date();
  const upcoming = appointments.filter((item) => new Date(`${item.preferred_date}T${item.preferred_time}+08:00`) >= now && ["pending", "confirmed"].includes(item.status.toLowerCase()));
  const pending = appointments.filter((item) => item.status.toLowerCase() === "pending");
  const confirmed = appointments.filter((item) => item.status.toLowerCase() === "confirmed");
  const completed = appointments.filter((item) => item.status.toLowerCase() === "completed");
  const cancelled = appointments.filter((item) => item.status.toLowerCase() === "cancelled");
  const history = appointments.filter((item) => new Date(`${item.preferred_date}T${item.preferred_time}+08:00`) < now || ["completed", "cancelled"].includes(item.status.toLowerCase()));
  const requestChange = async (event: React.FormEvent<HTMLFormElement>, appointment: Appointment, type: "reschedule" | "cancellation") => {
    event.preventDefault(); if (requestInFlight.current) return; if (!supabase) { setError("Supabase is not configured."); return; }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    requestInFlight.current=true;
    setBusyId(appointment.id); setError("");
    try {
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError || !user || user.id!==patientId) throw new Error("Please log in again before requesting a change.");
    const { data, error: insertError } = await supabase.from("patient_appointment_change_requests").insert({
      appointment_id: appointment.id, patient_id: user.id, request_type: type,
      requested_date: type === "reschedule" ? String(form.get("date")) : null,
      requested_time: type === "reschedule" ? String(form.get("time")) : null,
      reason: String(form.get("reason") ?? "").trim(),
    }).select("id,appointment_id,request_type,requested_date,requested_time,reason,status,created_at").single();
    if (insertError) setError(`Request could not be sent${insertError.code ? ` (${insertError.code})` : ""}: ${insertError.message}`);
    else if (data) { setRequests((current) => [data as Request, ...current]); formElement.reset(); }
    } catch { setError("Your request could not be sent. Check your session and connection, then try again."); }
    finally { requestInFlight.current=false; setBusyId(""); }
  };
  const requestForms = (item: Appointment) => <details className="patient-request-details"><summary>Request a change</summary><div className="patient-request-forms"><form onSubmit={(event) => void requestChange(event, item, "reschedule")}><h3>Request reschedule</h3><label>Preferred date<input name="date" type="date" min={new Date().toISOString().slice(0, 10)} required/></label><label>Preferred time<input name="time" type="time" required/></label><label>Note (optional)<textarea name="reason" maxLength={500} rows={2}/></label><button className="patient-secondary-button" disabled={busyId === item.id}>{busyId === item.id ? "Sending…" : "Send reschedule request"}</button></form><form onSubmit={(event) => void requestChange(event, item, "cancellation")}><h3>Request cancellation</h3><label>Reason (optional)<textarea name="reason" maxLength={500} rows={2}/></label><button className="patient-secondary-button" disabled={busyId === item.id}>{busyId === item.id ? "Sending…" : "Send cancellation request"}</button></form></div></details>;
  const card = (item: Appointment, showActions: boolean) => <article className="patient-card patient-appointment-card" key={item.id}><div className="patient-card-row"><div><h2>{item.service_name}</h2><p className="patient-appointment-meta"><span><Stethoscope size={14}/>{item.doctor || "Doctor to be assigned"}{item.specialty ? ` · ${item.specialty}` : ""}</span>{item.department&&<span>{item.department}</span>}<span><CalendarDays size={14}/>{item.preferred_date}</span><span><Clock3 size={14}/>{item.preferred_time.slice(0, 5)}</span></p></div>{item.is_demo && <span className="patient-demo-badge">DEMO DATA</span>}<span className={`patient-status status-${item.status.toLowerCase()}`}>{item.status}</span></div><details className="patient-detail-disclosure"><summary>View appointment details</summary><p><strong>Appointment ID:</strong> {item.id}</p><p><strong>Service:</strong> {item.service_name}</p><p><strong>Doctor:</strong> {item.doctor || "Doctor to be assigned"}</p>{item.specialty && <p><strong>Specialty:</strong> {item.specialty}</p>}{item.department&&<p><strong>Department:</strong> {item.department}</p>}{item.service_details && <p><strong>Service details:</strong> {item.service_details}</p>}<p><strong>Date:</strong> {item.preferred_date}</p><p><strong>Time:</strong> {item.preferred_time.slice(0,5)}</p><p><strong>Status:</strong> {item.status}</p><p><strong>Notes:</strong> {item.reason || "Not provided"}</p><p><strong>Scheduled:</strong> {dateTime(item.preferred_date, item.preferred_time)}</p></details>{showActions && !["cancelled", "completed"].includes(item.status.toLowerCase()) && requestForms(item)}{requests.filter((request) => request.appointment_id === item.id).map((request) => <p className="patient-request-status" key={request.id}>Change request: <strong>{request.request_type}</strong> · {request.status}{request.requested_date && ` · ${dateTime(request.requested_date, request.requested_time || "00:00")}`}</p>)}</article>;
  const section = (title: string, items: Appointment[], empty: string, actions = false) => <section className="patient-section-block"><div className="patient-section-title"><h2>{title}</h2><span>{items.length}</span></div>{items.length ? <div className="patient-list">{items.map((item) => card(item, actions))}</div> : <div className="patient-card patient-empty"><p>{empty}</p></div>}</section>;
  return <>
    <div className="patient-appointment-stats">{[["Upcoming", upcoming.length], ["Pending", pending.length], ["Confirmed", confirmed.length], ["Completed", completed.length], ["Cancelled", cancelled.length]].map(([label, value]) => <div className="patient-card patient-appointment-stat" key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</div>
    {error && <p className="patient-form-error" role="alert">{error}</p>}
    <div className="patient-history-filters" role="group" aria-label="Filter appointments">{["All appointments","Upcoming","Pending","Confirmed","Completed","Cancelled","History"].map(label=><button key={label} type="button" className={`patient-history-filter${filter===label ? " is-active" : ""}`} aria-pressed={filter===label} onClick={()=>setFilter(label)}>{label}</button>)}</div>
    {section(filter, filter==="All appointments" ? appointments : filter==="Upcoming" ? upcoming : filter==="Pending" ? pending : filter==="Confirmed" ? confirmed : filter==="Completed" ? completed : filter==="Cancelled" ? cancelled : history, "No appointments match this filter.", true)}
  </>;
}
