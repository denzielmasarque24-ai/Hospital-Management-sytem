import Link from "next/link";
import { BedDouble, CalendarDays, ClipboardList, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import PatientMedicalHistory from "./PatientMedicalHistory";
import { AssignedDoctorPhoto } from "./AssignedDoctorPhoto";
import PatientBillingContent from "./PatientBillingContent";
import { buildMedicalHistory, chargeAmount, doctorName, formatPatientDate, isCurrentAdmission, isDemo } from "@/lib/patient/dashboard.mjs";

type Row = Record<string, any>;
type DashboardData = {assignments?:Row[];doctors?:Row[];records?:Row[];documents?:Row[];bookings?:Row[];tests?:Row[];admissions?:Row[];rooms?:Row[];roomAssignments?:Row[];roomHistoryEnabled?:boolean;bills?:Row[];charges?:Row[];payments?:Row[];refunds?:Row[];moduleErrors?:Array<{module:string;table:string;code:string;message:string}>};
const money=(value:number|string)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(value));
const byId=(rows:Row[])=>new Map(rows.map(row=>[row.id,row]));
const invoice=(row?:Row)=>row?.invoice_number || row?.bill_number || "Invoice reference unavailable";
function Demo({financial=false}:{financial?:boolean}) {return <span className="patient-demo-badge">{financial ? "DEMO — NOT PAYABLE" : "DEMO DATA"}</span>;}
function Empty({children}:{children:ReactNode}) {return <section className="patient-card patient-empty"><ClipboardList size={23}/><p>{children}</p></section>;}
function Detail({label,value}:{label:string;value:ReactNode}) {return <div><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>;}
function Summary({items}:{items:[string,ReactNode][]}) {return <div className="patient-billing-stats">{items.map(([label,value])=><div className="patient-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;}

export default function PatientSectionContent({section,data}:{section:string;data:DashboardData}) {
  const doctors=byId(data.doctors ?? []);
  const admissionRelationErrors=(data.moduleErrors??[]).filter(error=>["doctors","hospital_rooms"].includes(error.module));
  if(section==="medical-history") {
    const history=buildMedicalHistory(data.records??[],data.bookings??[],data.tests??[],data.doctors??[],data.documents??[]);
    return <>{(data.moduleErrors??[]).map(error=><p className="patient-info-note" role="status" key={`${error.module}:${error.code}`}>{error.module==='lab_tests'||error.module==='lab_test_bookings'?'Laboratory bookings are partially unavailable.':error.module==='doctors'?'Some doctor profile details are unavailable.':'Some medical history records are unavailable.'} {error.message} ({error.code})</p>)}<PatientMedicalHistory items={history}/></>;
  }
  if(section==="assigned-doctor") {
    const admissions=[...(data.admissions ?? [])].filter(row=>row.doctor_id||row.doctor).sort((a,b)=>Date.parse(b.admitted_at||0)-Date.parse(a.admitted_at||0));
    const current=admissions.filter(row=>isCurrentAdmission(row)),history=admissions.filter(row=>!isCurrentAdmission(row));
    if(!admissions.length) return <>{admissionRelationErrors.filter(error=>error.module==="doctors").map(error=><p className="patient-info-note" role="status" key={`${error.module}:${error.code}`}>Doctor details could not be loaded: {error.message} ({error.code})</p>)}<Empty>Your care team has not assigned a doctor yet. Contact the hospital if you need assistance.</Empty></>;
    const renderDoctors=(rows:Row[],active:boolean)=><div className="patient-list">{rows.map(row=>{
      const doctor=row.doctor;
      const available=doctor?.available===true || doctor?.available==="true";
      const experience=doctor?.experience_years==null ? null : Number(doctor.experience_years);
      const fullName=doctorName(doctor);
      const nameWithoutTitle=fullName.replace(/^(?:dr\.?\s*)+/i, "").trim() || fullName;
      return <article className="patient-card patient-doctor-card" key={row.id}>
        <AssignedDoctorPhoto name={fullName} sources={[doctor?.image_url,doctor?.avatar_url,doctor?.photo_url]}/>
        <div className="patient-doctor-details">
          <div className="patient-badges"><span className="patient-status status-confirmed">{active?"Current assigned doctor":"Previous attending doctor"}</span>{(isDemo(row)||isDemo(doctor)) && <Demo/>}</div>
          <h2>{fullName}</h2>
          <p className="patient-muted">{doctor?.specialty || doctor?.specialization || row.department || "Specialty not listed"}</p>
          {!doctor && <p className="patient-form-error">Your assignment is available, but the doctor profile could not be accessed. Please contact your care team.</p>}
          <dl className="patient-record-grid"><Detail label="Department" value={doctor?.department}/><Detail label="Admission ID" value={row.id}/><Detail label="Admission date" value={formatPatientDate(row.admitted_at)}/><Detail label="Discharge date" value={row.discharged_at?formatPatientDate(row.discharged_at):active?"Currently admitted":null}/><Detail label="Admission status" value={row.status}/><Detail label="Availability" value={doctor ? available ? "Available" : "Not available" : null}/></dl>
          {doctor?.bio && <details className="patient-doctor-about"><summary>About Dr. {nameWithoutTitle}</summary><p>{doctor.bio}</p></details>}
          {doctor && (doctor.email || doctor.phone) && <details className="patient-doctor-about"><summary>Contact Information</summary><dl className="patient-record-grid"><Detail label="Email" value={doctor.email}/><Detail label="Phone" value={doctor.phone}/></dl></details>}
          {doctor && (doctor.availability_schedule || doctor.available != null) && <details className="patient-doctor-about"><summary>Availability</summary><p>{doctor.availability_schedule || (available ? "Available" : "Not available")}</p></details>}
          {doctor && (doctor.education || doctor.certifications || doctor.credentials) && <details className="patient-doctor-about"><summary>Education & Credentials</summary><p>{Array.isArray(doctor.education) ? doctor.education.join(" — ") : doctor.education || ""}{doctor.certifications ? ` — ${Array.isArray(doctor.certifications) ? doctor.certifications.join(" — ") : doctor.certifications}` : ""}{doctor.credentials ? ` — ${Array.isArray(doctor.credentials) ? doctor.credentials.join(" — ") : doctor.credentials}` : ""}</p></details>}
        </div>
        <div className="patient-action-links patient-doctor-actions">{doctor && available && <Link className="patient-primary-button" href={`/appointment?doctor=${encodeURIComponent(doctor.id)}`}><CalendarDays size={15}/>Book Appointment</Link>}<Link className="patient-secondary-button" href="/contact">Send Message</Link><Link className="patient-secondary-button" href="/patient/appointments">My appointments</Link></div>
      </article>;
    })}</div>;
    return <>{admissionRelationErrors.filter(error=>error.module==="doctors").map(error=><p className="patient-info-note" role="status" key={`${error.module}:${error.code}`}>Some doctor profile details could not be loaded: {error.message} ({error.code})</p>)}{renderDoctors(current,true)}<h2 className="patient-subheading">Previous Attending Doctors</h2>{renderDoctors(history,false)}</>;
  }
  if(section==="admissions") {
    const admissions=[...(data.admissions ?? [])].sort((a,b)=>Date.parse(b.admitted_at||0)-Date.parse(a.admitted_at||0));
    const current=admissions.filter(isCurrentAdmission);
    return <>{admissionRelationErrors.map(error=><p className="patient-info-note" role="status" key={`${error.module}:${error.code}`}>{error.module==="doctors"?"Doctor details could not be loaded":"Room details could not be loaded"}: {error.message} ({error.code})</p>)}<Summary items={[["Active",current.length],["Completed",admissions.filter(row=>row.status?.toLowerCase()==="completed").length],["Discharged",admissions.filter(row=>row.status?.toLowerCase()==="discharged"||Boolean(row.discharged_at)).length]]}/>{!current.length && <p className="patient-info-note">No active admission. You are not currently admitted.</p>}<h2 className="patient-subheading">Admission history</h2>{!admissions.length ? <Empty>No admission records are available.</Empty> : <div className="patient-list">{admissions.map(row=><article className="patient-card patient-record-card" key={row.id}><div className="patient-card-row"><h2>Admission {row.id}</h2><div className="patient-badges">{isDemo(row)&&<Demo/>}<span className="patient-status">{row.discharged_at || row.status?.toLowerCase()==="discharged" ? "Discharged" : row.status}</span></div></div><dl className="patient-record-grid"><Detail label="Admission ID" value={row.id}/><Detail label="Admission date" value={formatPatientDate(row.admitted_at)}/><Detail label="Discharge date" value={row.discharged_at ? formatPatientDate(row.discharged_at) : isCurrentAdmission(row) ? "Currently admitted" : "Not recorded"}/><Detail label="Admission status" value={row.status}/><Detail label="Assigned doctor" value={row.doctor_id?doctorName(doctors.get(row.doctor_id)):"Not assigned"}/><Detail label="Doctor specialty" value={doctors.get(row.doctor_id)?.specialty}/><Detail label="Room" value={row.room?.room_number || (row.room_id?"Room details unavailable":null)}/><Detail label="Room type" value={row.room?.room_type}/><Detail label="Bed" value={row.room?.bed_number}/><Detail label="Admission reason" value={row.reason}/><Detail label="Notes" value={row.notes}/></dl></article>)}</div>}</>;
  }
  if(section==="room-information") {
    const admissions=[...(data.admissions??[])].filter(row=>row.room_id||row.room).sort((a,b)=>Date.parse(b.admitted_at||0)-Date.parse(a.admitted_at||0));
    const current=admissions.filter(isCurrentAdmission),history=admissions.filter(row=>!isCurrentAdmission(row));
    const messages=(data.moduleErrors??[]).filter(error=>["hospital_rooms","hospital_room_assignment_history"].includes(error.module)).map(error=><p className="patient-info-note" role="status" key={`${error.module}:${error.code}`}>Room information could not be loaded: {error.message} ({error.code})</p>);
    const transfers=admissions.flatMap(admission=>(admission.room_assignment_history??[]).filter((entry:Row)=>entry.released_at).map((entry:Row)=>({...entry,admission_id:admission.id}))).sort((a,b)=>Date.parse(b.assigned_at)-Date.parse(a.assigned_at));
    const group=(title:string,rows:Row[],empty:string,active=false)=><section className="patient-section-block"><h2>{title}</h2>{!rows.length?<Empty>{empty}</Empty>:<div className="patient-list">{rows.map(admission=>{const room=admission.room;const bed=room?.bed_number?(/^bed\b/i.test(String(room.bed_number))?room.bed_number:`Bed ${room.bed_number}`):null;return <article className="patient-card patient-record-card" key={admission.id}><div className="patient-card-row"><h2><BedDouble size={19}/> Room {room?.room_number||"Details unavailable"}{bed?` · ${bed}`:""}</h2><div className="patient-badges"><span className="patient-status">{active?"Currently assigned":admission.status?.toLowerCase()==="discharged"?"Discharged":"Previous assignment"}</span>{(isDemo(admission)||isDemo(room))&&<Demo/>}</div></div><dl className="patient-record-grid"><Detail label="Room type" value={room?.room_type}/><Detail label="Room inventory status" value={room?.status}/><Detail label="Assigned doctor" value={doctorName(admission.doctor)}/><Detail label="Admission date" value={formatPatientDate(admission.admitted_at)}/><Detail label="Discharge date" value={admission.discharged_at?formatPatientDate(admission.discharged_at):null}/><Detail label="Admission status" value={admission.status}/></dl></article>;})}</div>}</section>;
    return <>{messages}{group("Current Room & Bed",current,"You currently have no assigned room or bed.",true)}{group("Previous Room & Bed History",history,"No previous room assignments are recorded.")}<section className="patient-section-block"><h2>Room Transfer History</h2>{!transfers.length?<Empty>{data.roomHistoryEnabled?"No room transfers are recorded.":"Room transfer history will be available after the room history migration is deployed."}</Empty>:<div className="patient-list">{transfers.map((entry:Row)=><article className="patient-card patient-record-card" key={entry.id}><div className="patient-card-row"><h2><BedDouble size={19}/> Room {entry.room?.room_number||"Details unavailable"}{entry.room?.bed_number?` · ${entry.room.bed_number}`:""}</h2><span className="patient-status">Previous room</span></div><dl className="patient-record-grid"><Detail label="Room type" value={entry.room?.room_type}/><Detail label="Assigned from" value={formatPatientDate(entry.assigned_at)}/><Detail label="Transferred from room" value={formatPatientDate(entry.released_at)}/><Detail label="Admission ID" value={entry.admission_id}/></dl></article>)}</div>}</section></>;
  }
  if(section==="billing") return <PatientBillingContent data={data}/>;
  const charges=(data.charges ?? []).filter(row=>["medical_supply","medicine"].includes(String(row.category).toLowerCase())&&row.is_demo===false),bills=byId(data.bills ?? []);
  if(!charges.length) return <Empty>No medical supply charges are recorded.</Empty>;
  return <><Summary items={[["Supply items",charges.length],["Total quantity",charges.reduce((sum,row)=>sum+Number(row.quantity),0)],["Supply charges",money(charges.reduce((sum,row)=>sum+chargeAmount(row),0))]]}/><div className="patient-list">{charges.map(item=><article className="patient-card patient-record-card patient-supply-card" key={item.id}><div className="patient-card-row"><div><p className="patient-eyebrow">{item.category || "Medical supply"}</p><h2>{item.item_name || item.description || "Medical supply charge"}</h2></div><span className="patient-status">{money(chargeAmount(item))}</span></div><dl className="patient-record-grid"><Detail label="Quantity" value={item.quantity}/><Detail label="Date" value={formatPatientDate(item.charge_date || item.created_at)}/><Detail label="Unit price" value={money(item.unit_price)}/><Detail label="Invoice" value={item.bill_id ? invoice(bills.get(item.bill_id)) : "Not yet invoiced"}/></dl><details className="patient-supply-details"><summary>View Details</summary><p>{item.description || item.item_name || "No further details recorded."}</p>{item.bill_id && <Link href="/patient/billing">View related bill</Link>}</details></article>)}</div></>;
}

function ChargeTable({charges,bills}:{charges:Row[];bills?:Map<string,Row>}) {
  return <div className="patient-responsive-table"><table className="patient-table"><caption className="patient-sr-only">Itemized hospital charges</caption><thead><tr><th scope="col">Charge</th><th scope="col">Quantity</th><th scope="col">Unit price</th><th scope="col">Total price</th>{bills&&<th scope="col">Related invoice</th>}</tr></thead><tbody>{charges.map(item=><tr key={item.id}><td>{item.item_name || item.description}{(isDemo(item)||isDemo(bills?.get(item.bill_id)))&&<Demo financial/>}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(chargeAmount(item))}</td>{bills&&<td>{item.bill_id ? <Link href="/patient/billing">{invoice(bills.get(item.bill_id))}</Link> : "Not yet invoiced"}</td>}</tr>)}</tbody></table></div>;
}

