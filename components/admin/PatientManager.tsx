"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabase/client";
import { loadPatientAdmissions } from "@/lib/patient/queries.mjs";

type Tab = "Overview" | "Assigned Doctor" | "Appointments" | "Medical History" | "Admissions & Room" | "Bills & Payments" | "Medical Supplies & Charges";
type Row = Record<string, any>;
type BillLine = { description: string; category: string; quantity: string; unit_price: string };
const tabs: Tab[] = ["Overview", "Assigned Doctor", "Appointments", "Medical History", "Admissions & Room", "Bills & Payments", "Medical Supplies & Charges"];
const errText = (error: unknown) => error instanceof Error ? error.message : "The request failed. Please try again.";
const php = (value: number | string) => `₱${Number(value ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PatientManager({ patientId }: { patientId: string }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [patient, setPatient] = useState<Row | null>(null);
  const [actorRole, setActorRole] = useState("");
  const [actorId, setActorId] = useState("");
  const [data, setData] = useState<Row>({});
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<Row>({});
  const [billLines, setBillLines] = useState<BillLine[]>([{ description: "", category: "other", quantity: "1", unit_price: "0" }]);
  const [labFile, setLabFile] = useState<File | null>(null);
  const [editingRecordId, setEditingRecordId] = useState("");

  const client = supabase;
  const call = useCallback(async (name: string, args: Row) => {
    if (!client) throw new Error("Supabase is not configured.");
    const result = await client.rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  }, [client]);

  const refresh = useCallback(async () => {
    if (!client) { setError("Supabase is not configured."); setLoading(false); return; }
    setLoading(true); setError(""); setNotice("");
    try {
      const { data: { user }, error: authError } = await client.auth.getUser();
      if (authError || !user) throw new Error("Please sign in again to access patient records.");
      setActorId(user.id);
      const actorProfile = await client.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (actorProfile.error) throw actorProfile.error;
      setActorRole(String(actorProfile.data?.role ?? "").toUpperCase());
      const profile = await client.from("profiles").select("id,first_name,middle_name,last_name,suffix,email,mobile_number,role").eq("id", patientId).maybeSingle();
      if (profile.error) throw profile.error;
      if (!profile.data || String(profile.data.role).toUpperCase() !== "PATIENT") throw new Error("Patient account not found or access is not authorized.");
      setPatient(profile.data);
      const permissionNames = ["care_management", "admissions", "billing", "inventory", "clinical_author", "clinical_release", "lab_author", "lab_release"];
      const permissionRows = await Promise.all(permissionNames.map(async (name) => {
        const result = await client.rpc("can_manage_patient_area", { p_area: name });
        return [name, !result.error && result.data === true] as const;
      }));
      setPermissions(Object.fromEntries(permissionRows));
      const next: Row = {};
      if ((tab === "Overview" && (permissions.care_management || permissions.admissions || permissions.billing || permissions.inventory)) || tab === "Assigned Doctor" || tab === "Admissions & Room" || tab === "Medical History") {
        const doctors = await client.from("doctors").select("id,display_name,specialty,department,avatar_url,image_url,available,is_demo").order("display_name");
        if (doctors.error) throw doctors.error;
        next.doctors = doctors.data ?? [];
        if ((tab === "Overview" || tab === "Assigned Doctor") && permissions.care_management) {
          const assignments = await client.from("patient_admissions").select("id,doctor_id,admitted_at,discharged_at,status,is_demo").eq("patient_id", patientId).order("admitted_at", { ascending: false });
          if (assignments.error) throw assignments.error; next.assignments = (assignments.data ?? []).filter((row:Row)=>row.doctor_id).map((row:Row)=>({id:row.id,doctor_id:row.doctor_id,department:next.doctors.find((doctor:Row)=>doctor.id===row.doctor_id)?.department,assigned_at:row.admitted_at,active:row.status==="admitted"&&!row.discharged_at,status:row.status,admitted_at:row.admitted_at,discharged_at:row.discharged_at,is_demo:row.is_demo}));
        }
      }
      if (tab === "Appointments") {
        const result = await client.from("appointments").select("id,appointment_date,appointment_time,status,doctor_id,service_id,notes,created_at").eq("patient_id", patientId).order("appointment_date", { ascending: false });
        if (result.error) throw result.error; next.appointments = result.data ?? [];
      }
      if ((tab === "Admissions & Room" || tab === "Overview") && permissions.admissions) {
        const admissions = await loadPatientAdmissions(client,patientId);
        const rooms = await client.from("hospital_rooms").select("id,room_number,room_type,bed_number,status,daily_rate,is_demo,created_at").order("room_number");
        if (rooms.error) throw rooms.error;
        next.admissions = admissions.admissions.map((row:Row)=>({...row,admission_number:row.id})); next.admissionRelationErrors=admissions.moduleErrors;
        next.roomAssignments = next.admissions.filter((row:Row)=>row.room_id).map((row:Row)=>({...row,...row.room,admission_id:row.id,assigned_at:row.created_at,status:row.status==="admitted"&&!row.discharged_at?"assigned":"historical"}));
        next.rooms = rooms.data ?? []; next.beds = (rooms.data ?? []).map((room:Row)=>({...room,bed_id:room.id,room_id:room.id,bed_type:room.room_type,bed_status:room.status}));
      }
      if ((tab === "Bills & Payments" || tab === "Overview") && permissions.billing) {
        const [bills, payments] = await Promise.all([
          client.from("patient_bills").select("id,admission_id,bill_number,description,issued_at,total_amount,status,receipt_url,approved_discount,taxes_and_fees,is_demo,payment_approved_at,payment_approved_by").eq("patient_id", patientId).order("issued_at", { ascending: false }),
          client.from("patient_payments").select("id,bill_id,amount,paid_at,payment_method,receipt_url,external_reference,receipt_number,status,is_demo").eq("patient_id", patientId).order("paid_at", { ascending: false }),
        ]);
        if (bills.error) throw bills.error; if (payments.error) throw payments.error;
        next.bills = bills.data ?? []; next.payments = payments.data ?? [];
      }
      if ((tab === "Medical Supplies & Charges" || tab === "Overview" || tab === "Bills & Payments") && (permissions.inventory || permissions.billing)) {
        const charges = await client.from("patient_medical_charges").select("id,admission_id,bill_id,item_name,category,quantity,unit_price,total_amount,charged_at,is_demo").eq("patient_id", patientId).order("charged_at", { ascending: false });
        if (charges.error) throw charges.error; next.charges = charges.data ?? [];
      }
      if ((tab === "Medical Supplies & Charges" || tab === "Overview") && permissions.inventory) {
        const products = await client.from("products").select("id,name,price,stock,available").eq("available", true).order("name");
        if (products.error) throw products.error; next.products = products.data ?? [];
      }
      setData(next);
    } catch (cause) { setError(errText(cause)); }
    finally { setLoading(false); }
  }, [client, patientId, tab, permissions.clinical_author, permissions.clinical_release, permissions.lab_author, permissions.lab_release]);

  useEffect(() => { void refresh(); }, [refresh]);
  const assignments = data.assignments ?? [];
  const currentDoctor = assignments.find((assignment: Row) => assignment.active);
  const doctorById = useMemo(() => Object.fromEntries((data.doctors ?? []).map((doctor: Row) => [doctor.id, doctor])), [data.doctors]);
  const activeAdmission = (data.admissions ?? []).find((item: Row) => item.status === "admitted" && !item.discharged_at);
  const activeRoom = activeAdmission?.room;
  const unpaid = (data.bills ?? []).filter((bill:Row)=>bill.is_demo===false&&bill.payment_approved_at).reduce((sum: number, bill: Row) => sum + Math.max(0, Number(bill.total_amount) - (data.payments ?? []).filter((payment: Row) => payment.bill_id === bill.id && payment.is_demo===false && ["completed","paid","succeeded"].includes(String(payment.status).toLowerCase())).reduce((total: number, payment: Row) => total + Number(payment.amount), 0)), 0);
  const visibleTabs = tabs.filter((item) => item === "Overview"
    || (item === "Assigned Doctor" && permissions.care_management)
    || (item === "Appointments" && ["ADMIN", "SUPER_ADMIN"].includes(actorRole))
    || (item === "Medical History" && (permissions.clinical_author || permissions.clinical_release || permissions.lab_author || permissions.lab_release))
    || (item === "Admissions & Room" && permissions.admissions)
    || (item === "Bills & Payments" && permissions.billing)
    || (item === "Medical Supplies & Charges" && (permissions.inventory || permissions.billing)));

  useEffect(() => { if (!visibleTabs.includes(tab) && visibleTabs.length) setTab(visibleTabs[0]); }, [tab, visibleTabs.join("|")]);

  async function run(action: () => Promise<unknown>, success: string) {
    setSaving(true); setError(""); setNotice("");
    try { await action(); setForm({}); setBillLines([{ description: "", category: "other", quantity: "1", unit_price: "0" }]); setLabFile(null); setEditingRecordId(""); await refresh(); setNotice(success); }
    catch (cause) { setError(errText(cause)); }
    finally { setSaving(false); }
  }

  return <div className="ad-root ad-patient-manager" style={{ padding: "20px 0" }}>
    <div className="ad-page-header"><div><p style={{ margin: 0, color: "#168c91", fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>PATIENT MANAGEMENT</p><h1 style={{ margin: "5px 0" }}>{patient ? [patient.first_name, patient.middle_name, patient.last_name, patient.suffix].filter(Boolean).join(" ") || "Patient" : "Manage Patient"}</h1><p>Patient ID: <code>{patientId}</code> · {patient?.email || "Email unavailable"}</p></div><Link className="ad-btn ad-btn-ghost" href="/admin/patients">Back to Patients</Link></div>
    {error && <div className="ad-content-alert error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}{notice && <div className="ad-content-alert success" role="status" style={{ marginBottom: 12 }}>{notice}</div>}
    <div className="ad-card" style={{ overflow: "hidden" }}>
      <div className="ad-toolbar" role="tablist" aria-label="Patient management sections" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{visibleTabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} className={`ad-btn ad-btn-sm ${tab === item ? "ad-btn-primary" : "ad-btn-ghost"}`} onClick={() => setTab(item)}>{item}</button>)}</div>
      <div style={{ padding: 20 }}>
      {loading ? <p role="status">Loading patient records…</p> : !patient ? <p>No patient record is available.</p> : <>
        {tab === "Overview" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          {permissions.care_management && <Summary label="Assigned doctor" value={currentDoctor ? doctorName(doctorById[currentDoctor.doctor_id]) : "Unassigned"}/>} {permissions.admissions && <><Summary label="Admission" value={activeAdmission?.status ?? "No active admission"}/><Summary label="Room / bed" value={activeRoom ? `${activeRoom.room_number} · ${activeRoom.bed_number || "Bed not listed"}` : "No active room"}/></>}{permissions.billing && <Summary label="Outstanding balance" value={php(unpaid)}/>}
          <div className="ad-card" style={{ padding: 16 }}><b>Contact details</b><p>{patient.email || "No email recorded"}</p><p>{patient.mobile_number || "No mobile number recorded"}</p></div>
        </div>}

        {tab === "Assigned Doctor" && <>
          <h2>Current assignment</h2>{currentDoctor ? <article className="ad-card" style={{ padding: 16, marginBottom: 18 }}><b>{doctorName(doctorById[currentDoctor.doctor_id])}</b><p>{doctorById[currentDoctor.doctor_id]?.specialty || "Specialty not listed"} · {currentDoctor.department || "Department not listed"}</p><p>Assigned {new Date(currentDoctor.assigned_at).toLocaleString()}</p></article> : <p>No current doctor assignment.</p>}
          {permissions.care_management ? <form className="ad-form-grid" onSubmit={(event) => { event.preventDefault(); void run(() => call("admin_assign_patient_doctor", { p_patient_id: patientId, p_doctor_id: form.doctor_id || null, p_department: form.department || "", p_consultation_type: form.consultation || "" }), form.doctor_id ? "Doctor assignment saved." : "Doctor assignment removed."); }}><label>Doctor<select required={Boolean(form.doctor_id)} value={form.doctor_id ?? ""} onChange={(event) => setForm({ ...form, doctor_id: event.target.value })}><option value="">Select a doctor to assign / clear assignment</option>{(data.doctors ?? []).map((doctor: Row) => <option key={doctor.id} value={doctor.id}>{doctorName(doctor)} · {doctor.specialty}</option>)}</select></label><label>Department<input value={form.department ?? ""} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="Department"/></label><label>Consultation type<input value={form.consultation ?? ""} onChange={(event) => setForm({ ...form, consultation: event.target.value })} placeholder="Consultation type"/></label><button className="ad-btn ad-btn-primary" disabled={saving}>Save assignment</button></form> : <p>This account does not have care management permission.</p>}
          <h3 style={{ marginTop: 24 }}>Assignment history</h3><Records rows={assignments} empty="No assignment history." render={(item) => <span>{doctorName(doctorById[item.doctor_id])} · {item.department || "No department"} · {new Date(item.assigned_at).toLocaleString()} · {item.active ? "Current" : "Previous"}</span>}/>
        </>}

        {tab === "Appointments" && <><p>Existing appointment requests are read from the appointments table.</p><Link className="ad-btn ad-btn-primary" href={`/admin/appointments?patient=${encodeURIComponent(patientId)}`}>Open appointment management</Link><Records rows={data.appointments ?? []} empty="No appointments found." render={(item) => <div><b>{item.appointment_date} · {item.appointment_time}</b><span> · {item.status} · {item.notes || "No notes"}</span></div>}/></>}

        {tab === "Admissions & Room" && <>
          {permissions.admissions ? <>
            <form className="ad-form-grid" onSubmit={(event) => { event.preventDefault(); void run(() => call("admin_admit_patient", { p_patient_id: patientId, p_reason: form.reason || "", p_department: form.department || "", p_admission_date: form.admission_date || new Date().toISOString().slice(0,10), p_doctor_id: form.doctor_id || null, p_bed_id: form.status === "pending" ? null : form.bed_id || null, p_admission_type: form.admission_type || "inpatient", p_status: form.status || "admitted" }), form.status === "pending" ? "Pending admission request created." : "Patient admission created."); }}>
              <label>Admission date<input type="date" value={form.admission_date ?? ""} onChange={(event) => setForm({ ...form, admission_date: event.target.value })}/></label><label>Admission type<select value={form.admission_type ?? "inpatient"} onChange={(event) => setForm({ ...form, admission_type: event.target.value })}><option value="inpatient">Inpatient</option><option value="emergency">Emergency</option><option value="observation">Observation</option><option value="transfer">Transfer</option></select></label><label>Admission status<select value={form.status ?? "admitted"} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="pending">Pending</option><option value="admitted">Admitted</option></select></label><label>Department<input value={form.department ?? ""} onChange={(event) => setForm({ ...form, department: event.target.value })}/></label><label>Admitting doctor<select value={form.doctor_id ?? ""} onChange={(event) => setForm({ ...form, doctor_id: event.target.value })}><option value="">Not assigned</option>{(data.doctors ?? []).map((doctor: Row) => <option key={doctor.id} value={doctor.id}>{doctorName(doctor)}</option>)}</select></label><label>Available room / bed<select disabled={form.status === "pending"} value={form.bed_id ?? ""} onChange={(event) => setForm({ ...form, bed_id: event.target.value })}><option value="">Admit without room assignment</option>{(data.beds ?? []).filter((bed: Row) => bed.status === "available").map((bed: Row) => { const room = (data.rooms ?? []).find((entry: Row) => entry.id === bed.room_id); return <option key={bed.id} value={bed.id}>{room?.room_number} · Bed {bed.bed_number} · {room?.category}</option>; })}</select></label><label className="ad-form-span">Admission reason<textarea value={form.reason ?? ""} onChange={(event) => setForm({ ...form, reason: event.target.value })}/></label><button className="ad-btn ad-btn-primary" disabled={saving || Boolean(activeAdmission)}>Save admission</button>
            </form>
            <form className="ad-form-grid" style={{ marginTop: 20 }} onSubmit={(event) => { event.preventDefault(); void run(() => call("admin_create_patient_room", { p_room_number: form.room_number, p_category: form.room_category || "", p_floor_or_ward: form.floor || "", p_beds: Number(form.bed_count || 1) }), "Room and beds added to inventory."); }}><h3 className="ad-form-span">Add a room to the bed inventory</h3><label>Room number<input required value={form.room_number ?? ""} onChange={(event) => setForm({ ...form, room_number: event.target.value })}/></label><label>Category<input value={form.room_category ?? ""} onChange={(event) => setForm({ ...form, room_category: event.target.value })}/></label><label>Floor / ward<input value={form.floor ?? ""} onChange={(event) => setForm({ ...form, floor: event.target.value })}/></label><label>Bed count<input type="number" min="1" max="32" value={form.bed_count ?? "1"} onChange={(event) => setForm({ ...form, bed_count: event.target.value })}/></label><button className="ad-btn ad-btn-ghost" disabled={saving}>Add room</button></form>
            {activeAdmission && <div style={{ marginTop: 20 }}><h3>Current admission</h3><p>Admission {activeAdmission.id} · Since {activeAdmission.admitted_at} · {activeAdmission.reason || "Reason not recorded"}</p>{activeRoom&&<p>Room {activeRoom.room_number} · {activeRoom.room_type} · {activeRoom.bed_number} · Inventory status: {activeRoom.status}</p>}<form className="ad-form-grid" onSubmit={(event) => { event.preventDefault(); void run(() => call("admin_transfer_patient_bed", { p_admission_id: activeAdmission.id, p_bed_id: form.transfer_bed }), "Room transfer completed; previous bed is marked for cleaning."); }}><label>Transfer to available bed<select required value={form.transfer_bed ?? ""} onChange={(event) => setForm({ ...form, transfer_bed: event.target.value })}><option value="">Select a bed</option>{(data.beds ?? []).filter((bed: Row) => bed.status === "available").map((bed: Row) => { const room = (data.rooms ?? []).find((entry: Row) => entry.id === bed.room_id); return <option key={bed.id} value={bed.id}>{room?.room_number} · {room?.room_type} · {bed.bed_number}</option>; })}</select></label><button className="ad-btn ad-btn-ghost" disabled={saving}>Transfer patient</button><button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={() => void run(() => call("admin_discharge_patient", { p_admission_id: activeAdmission.id, p_discharge_date: new Date().toISOString().slice(0,10) }), "Patient discharged; assigned bed is in cleaning status.")}>Discharge patient</button></form></div>}
            <h3 style={{ marginTop: 20 }}>Room and bed status</h3><Records rows={data.beds ?? []} empty="No room beds are configured." render={(bed) => { const room = (data.rooms ?? []).find((entry: Row) => entry.id === bed.room_id); return <span>{room?.room_number} · Bed {bed.bed_number} · {bed.status}{bed.status !== "occupied" && <select aria-label={`Set status for ${room?.room_number} bed ${bed.bed_number}`} style={{ marginLeft: 12 }} value={bed.status} onChange={(event) => void run(() => call("admin_set_patient_bed_status", { p_bed_id: bed.id, p_status: event.target.value }), "Bed status updated.")}><option value="available">Available</option><option value="cleaning">Cleaning</option><option value="maintenance">Maintenance</option></select>}</span>; }}/>
          </> : <p>This account does not have admissions permission.</p>}
          <h3 style={{ marginTop: 24 }}>Admission history</h3><Records rows={data.admissions ?? []} empty="No admission history." render={(item) => <div><span>Admission {item.id} · {item.status} · {item.admitted_at}{item.discharged_at ? ` to ${item.discharged_at}` : ""} · {item.reason || "No reason recorded"}</span><p>Doctor: {item.doctor?.display_name || "Not assigned"}{item.doctor?.specialty ? ` · ${item.doctor.specialty}` : ""}{item.doctor?.department ? ` · ${item.doctor.department}` : ""}</p><p>Room: {item.room?.room_number || "Not assigned"} · {item.room?.room_type || ""} · {item.room?.bed_number || ""} · Inventory status: {item.room?.status || "Not recorded"}</p>{item.notes&&<p>Notes: {item.notes}</p>}{item.is_demo&&<small>Demo record</small>}</div>}/>
        </>}

        {tab === "Medical History" && <section className="ad-card" style={{ padding: 18 }}>
          <h2>Clinical Records</h2>
          <p>Use the clinical workspaces to create drafts, review records, and release authorized results. Patient visibility is controlled by the clinical release workflow and Supabase RLS.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(permissions.clinical_author || permissions.clinical_release) && <Link className="ad-btn ad-btn-primary" href={`/admin/medical-records?patient=${encodeURIComponent(patientId)}`}>Open Medical Records</Link>}
            {(permissions.lab_author || permissions.lab_release) && <Link className="ad-btn ad-btn-ghost" href={`/admin/laboratory-results?patient=${encodeURIComponent(patientId)}`}>Open Laboratory Results</Link>}
          </div>
        </section>}

                {tab === "Bills & Payments" && <>
          {permissions.billing ? <>
            <form className="ad-form-grid" onSubmit={(event)=>{event.preventDefault();if(billLines.some((line)=>!line.description.trim())){setError("Enter a description for each bill line.");return;}const reference=form.bill_reference||crypto.randomUUID();setForm({...form,bill_reference:reference});const items=billLines.map((line)=>({description:line.description.trim(),category:line.category,quantity:Number(line.quantity),unit_price:Number(line.unit_price)}));void run(()=>call("billing_create_patient_bill",{p_patient_id:patientId,p_admission_id:form.bill_admission||null,p_description:form.bill_description||"Hospital charges",p_discount:Number(form.discount||0),p_taxes:Number(form.taxes||0),p_items:items,p_external_reference:reference}),"Bill created with server-calculated totals.");}}>
              <h3 className="ad-form-span">Create itemized bill</h3>
              <label>Bill description<input value={form.bill_description??""} onChange={(event)=>setForm({...form,bill_description:event.target.value})}/></label>
              <label>Admission<select value={form.bill_admission??""} onChange={(event)=>setForm({...form,bill_admission:event.target.value})}><option value="">Not linked to admission</option>{(data.admissions??[]).map((item:Row)=><option key={item.id} value={item.id}>{item.admission_number} · {item.status}</option>)}</select></label>
              {billLines.map((line,index)=><div key={index} className="ad-form-span ad-patient-bill-line" style={{padding:12,border:"1px solid var(--ad-border)",borderRadius:10}}>
                <label>Charge description<input required value={line.description} onChange={(event)=>setBillLines(billLines.map((item,i)=>i===index?{...item,description:event.target.value}:item))}/></label>
                <label>Category<select value={line.category} onChange={(event)=>setBillLines(billLines.map((item,i)=>i===index?{...item,category:event.target.value}:item))}>{["room","consultation","laboratory","diagnostic","medicine","medical_supply","other"].map((category)=><option key={category} value={category}>{category.replaceAll("_"," ")}</option>)}</select></label>
                <label>Qty<input type="number" min="0.001" step="0.001" required value={line.quantity} onChange={(event)=>setBillLines(billLines.map((item,i)=>i===index?{...item,quantity:event.target.value}:item))}/></label>
                <label>Unit price (PHP)<input type="number" min="0" step="0.01" required value={line.unit_price} onChange={(event)=>setBillLines(billLines.map((item,i)=>i===index?{...item,unit_price:event.target.value}:item))}/></label>
                <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={billLines.length===1} onClick={()=>setBillLines(billLines.filter((_,i)=>i!==index))}>Remove</button>
              </div>)}
              <button type="button" className="ad-btn ad-btn-ghost ad-form-span" onClick={()=>setBillLines([...billLines,{description:"",category:"other",quantity:"1",unit_price:"0"}])}>Add another charge</button>
              <label>Approved discount (PHP)<input type="number" min="0" step="0.01" value={form.discount??"0"} onChange={(event)=>setForm({...form,discount:event.target.value})}/></label>
              <label>Taxes / fees (PHP)<input type="number" min="0" step="0.01" value={form.taxes??"0"} onChange={(event)=>setForm({...form,taxes:event.target.value})}/></label>
              <button className="ad-btn ad-btn-primary" disabled={saving}>Create bill</button>
            </form>
          </> : <p>This account does not have billing permission.</p>}
          <h3 style={{ marginTop: 22 }}>Bills and payment history</h3><Records rows={data.bills ?? []} empty="No bills available." render={(bill) => { const payments=(data.payments??[]).filter((p:Row)=>p.bill_id===bill.id);const paid=payments.filter((p:Row)=>!p.is_demo&&["completed","paid","succeeded"].includes(String(p.status||"").toLowerCase())).reduce((sum:number,p:Row)=>sum+Number(p.amount),0);const items=(data.charges??[]).filter((charge:Row)=>charge.bill_id===bill.id);return <div><b>{bill.bill_number} · {php(bill.total_amount)} · {bill.status}</b><p>{bill.description} · {new Date(bill.issued_at).toLocaleDateString()} · Balance {php(Math.max(0,Number(bill.total_amount)-paid))}</p>{items.map((item:Row)=><p key={item.id}>{item.item_name} · {item.quantity} × {php(item.unit_price)} = {php(item.total_amount)}</p>)}{permissions.billing&&!bill.is_demo&&!bill.payment_approved_at&&["unpaid","partial"].includes(String(bill.status).toLowerCase())&&<button type="button" className="ad-btn ad-btn-primary ad-btn-sm" disabled={saving||items.length===0} onClick={()=>void run(()=>call("billing_approve_patient_bill",{p_bill_id:bill.id}),"Bill reviewed and approved for staff-managed payment recording.")}>Approve bill for payment recording</button>}{!bill.is_demo&&!bill.payment_approved_at&&["unpaid","partial"].includes(String(bill.status).toLowerCase())&&<p>Awaiting billing approval</p>}{permissions.billing&&bill.payment_approved_at&&Number(bill.total_amount)>paid&&<form onSubmit={(event)=>{event.preventDefault();const reference=form["payment_ref_"+bill.id]||crypto.randomUUID();setForm({...form,["payment_ref_"+bill.id]:reference});void run(()=>call("billing_record_patient_payment",{p_bill_id:bill.id,p_amount:Number(form[`payment_${bill.id}`]),p_payment_method:form[`method_${bill.id}`]||"In person",p_external_reference:reference}),"Payment recorded.");}} style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}><input aria-label="Payment amount in PHP" type="number" min="0.01" step="0.01" max={Number(bill.total_amount)-paid} value={form[`payment_${bill.id}`]??""} onChange={(event)=>setForm({...form,[`payment_${bill.id}`]:event.target.value})} required/><input aria-label="Payment method" placeholder="Payment method" value={form[`method_${bill.id}`]??""} onChange={(event)=>setForm({...form,[`method_${bill.id}`]:event.target.value})}/><button className="ad-btn ad-btn-ghost ad-btn-sm" disabled={saving}>Record payment</button></form>}{payments.map((payment:Row)=><p key={payment.id}>Paid {php(payment.amount)} · {payment.payment_method} · {new Date(payment.paid_at).toLocaleString()}{payment.receipt_number ? " \u00b7 Receipt " + payment.receipt_number : ""}</p>)}</div>; }}/>
          <h3 style={{ marginTop: 22 }}>Unbilled supply charges</h3>
          <Records rows={(data.charges ?? []).filter((charge: Row) => charge.category === "medical_supply" && !charge.bill_id)} empty="No unbilled supply charges." render={(charge) => <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}><span>{charge.item_name} · {charge.quantity} × {php(charge.unit_price)} = {php(charge.total_amount)}</span>{(data.bills ?? []).length > 0 && <><select aria-label={"Bill for " + charge.item_name} value={form["billFor_" + charge.id] ?? ""} onChange={(event) => setForm({ ...form, ["billFor_" + charge.id]: event.target.value })}><option value="">Choose a bill</option>{(data.bills ?? []).map((bill: Row) => <option key={bill.id} value={bill.id}>{bill.bill_number}</option>)}</select><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={saving || !form["billFor_" + charge.id]} onClick={() => void run(() => call("billing_add_existing_supply_charge", { p_bill_id: form["billFor_" + charge.id], p_charge_id: charge.id }), "Existing supply charge added to the bill once.")}>Add to bill</button></>}</div>}/>
        </>}

        {tab === "Medical Supplies & Charges" && <>
          {permissions.inventory && <form className="ad-form-grid" onSubmit={(event) => { event.preventDefault(); const reference=form.supply_reference||crypto.randomUUID();setForm({...form,supply_reference:reference}); void run(() => call("inventory_record_patient_supply", { p_patient_id: patientId, p_admission_id: form.supply_admission || null, p_product_id: form.product_id, p_quantity: Number(form.supply_quantity || 1), p_bill_id: form.supply_bill || null, p_external_reference: reference }), "Supply use recorded; stock and any linked bill were updated."); }}><h3 className="ad-form-span">Record supply use from stock</h3><label>Inventory item<select required value={form.product_id ?? ""} onChange={(event) => setForm({ ...form, product_id: event.target.value })}><option value="">Select an active item</option>{(data.products ?? []).map((product:Row)=><option key={product.id} value={product.id}>{product.name} · {product.stock} in stock · {php(product.price)}</option>)}</select></label><label>Quantity<input type="number" min="1" step="1" value={form.supply_quantity??"1"} onChange={(event)=>setForm({...form,supply_quantity:event.target.value})}/></label><label>Admission<select value={form.supply_admission??""} onChange={(event)=>setForm({...form,supply_admission:event.target.value})}><option value="">Not linked to admission</option>{(data.admissions??[]).map((item:Row)=><option key={item.id} value={item.id}>{item.admission_number}</option>)}</select></label><label>Bill<select value={form.supply_bill??""} onChange={(event)=>setForm({...form,supply_bill:event.target.value})}><option value="">Record charge without billing it yet</option>{(data.bills??[]).map((bill:Row)=><option key={bill.id} value={bill.id}>{bill.bill_number}</option>)}</select></label><button className="ad-btn ad-btn-primary" disabled={saving}>Record supply use</button></form>}
          {!permissions.inventory&&<p>This account does not have inventory permission.</p>}
          <h3 style={{marginTop:22}}>Recorded patient supplies and charges</h3><Records rows={data.charges??[]} empty="No supply or medical charges have been recorded." render={(item)=> <span>{item.item_name} · {item.quantity} × {php(item.unit_price)} = {php(item.total_amount)} · {new Date(item.charged_at).toLocaleString()}{item.bill_id?" · Added to bill":" · Not billed"}</span>}/>
        </>}
      </>}
      </div>
    </div>
  </div>;
}

function doctorName(doctor?: Row) { return doctor ? (doctor.display_name || `Dr. ${[doctor.first_name, doctor.last_name].filter(Boolean).join(" ") || "Doctor"}`) : "Doctor profile unavailable"; }
function Summary({ label, value }: { label: string; value: string }) { return <div className="ad-card" style={{ padding: 16 }}><small style={{ color: "#718398" }}>{label}</small><strong style={{ display: "block", marginTop: 6, color: "#12386d" }}>{value}</strong></div>; }
function Records({ rows, empty, render }: { rows: Row[]; empty: string; render: (row: Row) => ReactNode }) { return rows.length ? <div style={{ display: "grid", gap: 9, marginTop: 12 }}>{rows.map((row) => <article className="ad-card" key={row.id} style={{ padding: 14 }}>{render(row)}</article>)}</div> : <p className="ad-empty">{empty}</p>; }


