import Link from "next/link";
import { BedDouble, CalendarDays, ClipboardList, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import PatientMedicalHistory from "./PatientMedicalHistory";
import { AssignedDoctorPhoto } from "./AssignedDoctorPhoto";
import PatientBillingContent from "./PatientBillingContent";
import { buildMedicalHistory, chargeAmount, doctorName, formatPatientDate, isCurrentAdmission, isDemo } from "@/lib/patient/dashboard.mjs";

type Row = Record<string, any>;
type DashboardData = {assignments?:Row[];doctors?:Row[];records?:Row[];bookings?:Row[];tests?:Row[];admissions?:Row[];rooms?:Row[];bills?:Row[];charges?:Row[];payments?:Row[];refunds?:Row[]};
const money=(value:number|string)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(value));
const byId=(rows:Row[])=>new Map(rows.map(row=>[row.id,row]));
const invoice=(row?:Row)=>row?.invoice_number || row?.bill_number || "Invoice reference unavailable";
function Demo({financial=false}:{financial?:boolean}) {return <span className="patient-demo-badge">{financial ? "DEMO — NOT PAYABLE" : "DEMO DATA"}</span>;}
function Empty({children}:{children:ReactNode}) {return <section className="patient-card patient-empty"><ClipboardList size={23}/><p>{children}</p></section>;}
function Detail({label,value}:{label:string;value:ReactNode}) {return <div><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>;}
function Summary({items}:{items:[string,ReactNode][]}) {return <div className="patient-billing-stats">{items.map(([label,value])=><div className="patient-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;}

export default function PatientSectionContent({section,data}:{section:string;data:DashboardData}) {
  const doctors=byId(data.doctors ?? []);
  if(section==="medical-history") return <PatientMedicalHistory items={buildMedicalHistory(data.records ?? [],data.bookings ?? [],data.tests ?? [],data.doctors ?? [])}/>;
  if(section==="assigned-doctor") {
    const assignments=[...(data.assignments ?? [])].sort((a,b)=>Date.parse(b.assigned_at)-Date.parse(a.assigned_at));
    if(!assignments.length) return <Empty>Your care team has not assigned a doctor yet. Contact the hospital if you need assistance.</Empty>;
    return <div className="patient-list">{assignments.map(row=>{
      const doctor=doctors.get(row.doctor_id);
      const available=doctor?.available===true || doctor?.available==="true";
      const experience=doctor?.experience_years==null ? null : Number(doctor.experience_years);
      const fullName=doctorName(doctor);
      const nameWithoutTitle=fullName.replace(/^(?:dr\.?\s*)+/i, "").trim() || fullName;
      return <article className="patient-card patient-doctor-card" key={row.id}>
        <AssignedDoctorPhoto name={fullName} sources={[doctor?.image_url,doctor?.avatar_url,doctor?.photo_url]}/>
        <div className="patient-doctor-details">
          <div className="patient-badges"><span className="patient-status status-confirmed">Active assignment</span>{(isDemo(row)||isDemo(doctor)) && <Demo/>}</div>
          <h2>{fullName}</h2>
          <p className="patient-muted">{doctor?.specialty || doctor?.specialization || row.department || "Specialty not listed"}</p>
          {!doctor && <p className="patient-form-error">Your assignment is available, but the doctor profile could not be accessed. Please contact your care team.</p>}
          <dl className="patient-record-grid"><Detail label="Department" value={doctor?.department || row.department}/><Detail label="Experience" value={Number.isFinite(experience) ? `${experience} years` : null}/><Detail label="Availability" value={doctor ? available ? "Available" : "Not available" : null}/><Detail label="Assigned on" value={formatPatientDate(row.assigned_at)}/></dl>
          {doctor?.bio && <details className="patient-doctor-about"><summary>About Dr. {nameWithoutTitle}</summary><p>{doctor.bio}</p></details>}
          {doctor && (doctor.email || doctor.phone) && <details className="patient-doctor-about"><summary>Contact Information</summary><dl className="patient-record-grid"><Detail label="Email" value={doctor.email}/><Detail label="Phone" value={doctor.phone}/></dl></details>}
          {doctor && (doctor.availability_schedule || doctor.available != null) && <details className="patient-doctor-about"><summary>Availability</summary><p>{doctor.availability_schedule || (available ? "Available" : "Not available")}</p></details>}
          {doctor && (doctor.education || doctor.certifications || doctor.credentials) && <details className="patient-doctor-about"><summary>Education & Credentials</summary><p>{Array.isArray(doctor.education) ? doctor.education.join(" — ") : doctor.education || ""}{doctor.certifications ? ` — ${Array.isArray(doctor.certifications) ? doctor.certifications.join(" — ") : doctor.certifications}` : ""}{doctor.credentials ? ` — ${Array.isArray(doctor.credentials) ? doctor.credentials.join(" — ") : doctor.credentials}` : ""}</p></details>}
        </div>
        <div className="patient-action-links patient-doctor-actions">{doctor && available && <Link className="patient-primary-button" href={`/appointment?doctor=${encodeURIComponent(doctor.id)}`}><CalendarDays size={15}/>Book Appointment</Link>}<Link className="patient-secondary-button" href="/contact">Send Message</Link><Link className="patient-secondary-button" href="/patient/appointments">My appointments</Link></div>
      </article>;
    })}</div>;
  }
  if(section==="admissions") {
    const admissions=[...(data.admissions ?? [])].sort((a,b)=>Date.parse(b.admission_date)-Date.parse(a.admission_date));
    const current=admissions.filter(isCurrentAdmission);
    return <><Summary items={[["Active",current.length],["Completed",admissions.filter(row=>row.status?.toLowerCase()==="completed").length],["Discharged",admissions.filter(row=>Boolean(row.discharge_date)).length]]}/>{!current.length && <p className="patient-info-note">You are not currently admitted.</p>}<h2 className="patient-subheading">Admission history</h2>{!admissions.length ? <Empty>No admission records are available.</Empty> : <div className="patient-list">{admissions.map(row=><article className="patient-card patient-record-card" key={row.id}><div className="patient-card-row"><h2>{row.admission_number || "Hospital admission"}</h2><div className="patient-badges">{isDemo(row)&&<Demo/>}<span className="patient-status">{row.discharge_date ? "Discharged" : row.status}</span></div></div><dl className="patient-record-grid"><Detail label="Admission date" value={formatPatientDate(row.admission_date)}/><Detail label="Discharge date" value={row.discharge_date ? formatPatientDate(row.discharge_date) : isCurrentAdmission(row) ? "Currently admitted" : "Not recorded"}/><Detail label="Assigned doctor" value={doctorName(doctors.get(row.doctor_id))}/><Detail label="Admission reason" value={row.reason || row.admission_reason}/></dl></article>)}</div>}</>;
  }
  if(section==="room-information") {
    const rooms=byId(data.rooms ?? []);
    const assignments=(data.admissions ?? []).filter(row=>row.room_id || row.hospital_room_id || row.room_number).sort((a,b)=>Date.parse(b.admission_date)-Date.parse(a.admission_date));
    const current=assignments.filter(isCurrentAdmission),history=assignments.filter(row=>!isCurrentAdmission(row));
    const group=(title:string,rows:Row[],empty:string)=><section className="patient-section-block"><h2>{title}</h2>{!rows.length ? <Empty>{empty}</Empty> : <div className="patient-list">{rows.map(row=>{
      const room=rooms.get(row.room_id ?? row.hospital_room_id);
      return <article className="patient-card patient-record-card" key={row.id}><div className="patient-card-row"><h2><BedDouble size={19}/> Room {room?.room_number || row.room_number || "Details unavailable"}</h2><div className="patient-badges">{(isDemo(row)||isDemo(room))&&<Demo/>}<span className="patient-status">{room?.status || (isCurrentAdmission(row) ? "Current room" : "Historical assignment")}</span></div></div>{!room && !row.room_number && <p className="patient-form-error">Room details could not be accessed. Please contact the hospital.</p>}<dl className="patient-record-grid"><Detail label="Room type" value={room?.room_type || room?.type || room?.category || row.room_type}/><Detail label="Bed number" value={row.bed_number}/><Detail label="Admission date" value={formatPatientDate(row.admission_date)}/><Detail label="Discharge date" value={formatPatientDate(row.discharge_date)}/><Detail label="Admission reference" value={row.admission_number}/></dl>{isCurrentAdmission(row) && room?.amenities && <p className="patient-info-note"><strong>Room amenities:</strong> {Array.isArray(room.amenities) ? room.amenities.join(", ") : room.amenities}</p>}</article>;
    })}</div>}</section>;
    return <>{group("Current room",current,"No room is currently assigned to you.")}{current.length>0 && <p className="patient-room-guide"><strong>Room status guide</strong><span>Clean</span><span>Occupied</span><span>Dirty</span><span>Ready to Occupy</span></p>}{group("Room History",history,"No previous room assignments are recorded.")}</>;
  }
  if(section==="billing") return <PatientBillingContent data={data}/>;
  const charges=(data.charges ?? []).filter(row=>row.category==="medical_supply"),bills=byId(data.bills ?? []);
  if(!charges.length) return <Empty>No medical supply charges are recorded.</Empty>;
  return <><Summary items={[["Supply items",charges.length],["Total quantity",charges.reduce((sum,row)=>sum+Number(row.quantity),0)],["Supply charges",money(charges.reduce((sum,row)=>sum+chargeAmount(row),0))]]}/><div className="patient-list">{charges.map(item=><article className="patient-card patient-record-card patient-supply-card" key={item.id}><div className="patient-card-row"><div><p className="patient-eyebrow">{item.category || "Medical supply"}</p><h2>{item.item_name || item.description || "Medical supply charge"}</h2></div><span className="patient-status">{money(chargeAmount(item))}</span></div><dl className="patient-record-grid"><Detail label="Quantity" value={item.quantity}/><Detail label="Date" value={formatPatientDate(item.charge_date || item.created_at)}/><Detail label="Unit price" value={money(item.unit_price)}/><Detail label="Invoice" value={item.bill_id ? invoice(bills.get(item.bill_id)) : "Not yet invoiced"}/></dl><details className="patient-supply-details"><summary>View Details</summary><p>{item.description || item.item_name || "No further details recorded."}</p>{item.bill_id && <Link href="/patient/billing">View related bill</Link>}</details></article>)}</div></>;
}

function ChargeTable({charges,bills}:{charges:Row[];bills?:Map<string,Row>}) {
  return <div className="patient-responsive-table"><table className="patient-table"><caption className="patient-sr-only">Itemized hospital charges</caption><thead><tr><th scope="col">Charge</th><th scope="col">Quantity</th><th scope="col">Unit price</th><th scope="col">Total price</th>{bills&&<th scope="col">Related invoice</th>}</tr></thead><tbody>{charges.map(item=><tr key={item.id}><td>{item.item_name || item.description}{(isDemo(item)||isDemo(bills?.get(item.bill_id)))&&<Demo financial/>}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(chargeAmount(item))}</td>{bills&&<td>{item.bill_id ? <Link href="/patient/billing">{invoice(bills.get(item.bill_id))}</Link> : "Not yet invoiced"}</td>}</tr>)}</tbody></table></div>;
}

