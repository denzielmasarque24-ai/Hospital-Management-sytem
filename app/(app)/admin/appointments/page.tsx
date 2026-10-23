"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/lib/supabase/client";

type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed";
type Appointment = {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  service_id: string | null;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
  notes: string | null;
  created_at: string;
  patient_display_name: string;
  patient_phone: string;
  service_name: string;
  doctor_name: string;
  doctor_specialty: string;
  doctor_department: string;
  email: string;
};
type AppointmentRow = Omit<Appointment, "patient_display_name" | "patient_phone" | "service_name" | "doctor_name" | "doctor_specialty" | "doctor_department" | "email">;
type Profile = { id: string; first_name: string | null; middle_name: string | null; last_name: string | null; suffix: string | null; email: string | null; phone: string | null; mobile_number: string | null };
type Doctor = { id: string; display_name: string | null; specialty: string | null; department: string | null };
const statuses: Array<AppointmentStatus | "all"> = ["all", "pending", "confirmed", "completed", "cancelled"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizeUuid = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return UUID.test(normalized) ? normalized.toLowerCase() : null;
};
const uniqueUuids = (values: unknown[]) => [...new Set(values.map(normalizeUuid).filter((id): id is string => id !== null))];
const pageSize = 20;
const fullName = (person?: Profile) => person
  ? [person.first_name, person.middle_name, person.last_name, person.suffix].filter((part) => part?.trim()).join(" ") || "Name not provided"
  : "Name not provided";
const errorMessage = (error: { code?: string; message?: string; details?: string; hint?: string }) =>
  `${error.code ? `(${error.code}) ` : ""}${error.message || "Unknown database error"}${error.details ? ` ${error.details}` : ""}${error.hint ? ` Hint: ${error.hint}` : ""}`;

export default function AdminAppointmentsPage() {
  const [rows, setRows] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AppointmentStatus | "all">("all");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: queryError } = await supabase.from("appointments")
      .select("id,patient_id,doctor_id,service_id,appointment_date,appointment_time,status,notes,created_at")
      .order("appointment_date", { ascending: true }).order("appointment_time", { ascending: true }).limit(1000);
    if (queryError) {
      console.error("[AdminAppointments] Appointment query failed", queryError);
      setError(`Appointments could not be loaded: ${errorMessage(queryError)}`); setLoading(false); return;
    }

    const appointmentRows = (data ?? []) as AppointmentRow[];
    const patientIds = uniqueUuids(appointmentRows.map((row) => row.patient_id));
    const serviceIds = uniqueUuids(appointmentRows.map((row) => row.service_id));
    const doctorIds = uniqueUuids(appointmentRows.map((row) => row.doctor_id));
    const [profilesResult, servicesResult, doctorsResult] = await Promise.all([
      patientIds.length ? supabase.from("profiles").select("id,first_name,middle_name,last_name,suffix,email,phone,mobile_number").in("id", patientIds) : Promise.resolve({ data: [], error: null }),
      serviceIds.length ? supabase.from("services").select("id,name").in("id", serviceIds) : Promise.resolve({ data: [], error: null }),
      doctorIds.length ? supabase.from("doctors").select("id,display_name,specialty,department").in("id", doctorIds) : Promise.resolve({ data: [], error: null }),
    ]);
    const lookupResults = [
      { source: "profiles patient lookup", error: profilesResult.error },
      { source: "services lookup", error: servicesResult.error },
      { source: "doctors lookup", error: doctorsResult.error },
    ];
    for (const { source, error: lookupError } of lookupResults) {
      if (lookupError) console.error("[AdminAppointments] Appointment related-data query failed", {
        source,
        code: lookupError.code,
        message: lookupError.message,
        details: lookupError.details,
        hint: lookupError.hint,
      });
    }
    const firstLookupError = lookupResults.find((result) => result.error);
    if (firstLookupError?.error) {
      setError(`Appointments loaded, but ${firstLookupError.source.replace(" lookup", "")} failed: ${errorMessage(firstLookupError.error)}`);
    }
    const profiles = new Map(((profilesResult.data ?? []) as Profile[]).map((person) => [normalizeUuid(person.id) ?? person.id, person]));
    const services = new Map(((servicesResult.data ?? []) as { id: string; name: string }[]).map((service) => [normalizeUuid(service.id) ?? service.id, service.name]));
    const doctors = new Map(((doctorsResult.data ?? []) as Doctor[]).map((doctor) => [normalizeUuid(doctor.id) ?? doctor.id, doctor]));
    setRows(appointmentRows.map((row) => {
      const patient = profiles.get(normalizeUuid(row.patient_id) ?? row.patient_id);
      const serviceId = typeof row.service_id === "string" ? row.service_id.trim() : "";
      const normalizedServiceId = normalizeUuid(serviceId);
      const doctor = row.doctor_id ? doctors.get(normalizeUuid(row.doctor_id) ?? row.doctor_id) : undefined;
      return {
        ...row,
        patient_display_name: fullName(patient),
        email: patient?.email ?? "",
        patient_phone: patient?.phone || patient?.mobile_number || "",
        service_name: !serviceId || serviceId.toLowerCase() === "null"
          ? "Service not specified"
          : normalizedServiceId ? services.get(normalizedServiceId) ?? "Service unavailable" : "Service unavailable",
        doctor_name: row.doctor_id ? doctor?.display_name || "Doctor unavailable" : "No preference",
        doctor_specialty: row.doctor_id ? doctor?.specialty || "" : "",
        doctor_department: row.doctor_id ? doctor?.department || "" : "",
      };
    }));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const patientId = new URLSearchParams(window.location.search).get("patient");
    if (patientId) setQuery(patientId);
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => (status === "all" || row.status === status) &&
      (!needle || [row.patient_display_name, row.email, row.service_name, row.doctor_name, row.doctor_specialty, row.doctor_department, row.patient_id].some((value) => value.toLowerCase().includes(needle))));
  }, [rows, query, status]);
  useEffect(() => { setPage(0); }, [query, status]);
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const updateStatus = async (appointment: Appointment, nextStatus: AppointmentStatus) => {
    if (!supabase || savingId) return;
    setSavingId(appointment.id); setError(""); setNotice("");
    const { data, error: updateError } = await supabase.from("appointments").update({ status: nextStatus })
      .eq("id", appointment.id).select("id,status").single();
    if (updateError) {
      console.error("[AdminAppointments] Status update failed", updateError);
      setError(`Appointment status could not be updated: ${errorMessage(updateError)}`);
    } else {
      setRows((current) => current.map((row) => row.id === data.id ? { ...row, status: data.status as AppointmentStatus } : row));
      window.dispatchEvent(new Event("medwell:appointments-updated"));
      setNotice(`Appointment status updated to ${data.status}.`);
    }
    setSavingId(null);
  };

  return <AdminShell title="Appointments" adminOnly>
    <div className="ad-page-header">
      <div><h1>Appointments</h1><p>Review and update patient appointment requests.</p></div>
      <button type="button" className="ad-btn ad-btn-ghost" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
    </div>

    <div className="ad-card">
      <div className="ad-toolbar" style={{ flexWrap: "wrap" }}>
        <input className="ad-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search patient, service, doctor, or ID" aria-label="Search appointments" />
        <select className="ad-select" style={{ width: "auto" }} value={status} onChange={(event) => setStatus(event.target.value as AppointmentStatus | "all")} aria-label="Filter appointment status">
          {statuses.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : item === "cancelled" ? "Rejected / cancelled" : item[0].toUpperCase() + item.slice(1)}</option>)}
        </select>
      </div>
      {error ? <p role="alert" style={{ color: "#b91c1c", padding: "0 16px 12px" }}>{error}</p> : null}
      {notice ? <p role="status" style={{ color: "#166534", padding: "0 16px 12px" }}>{notice}</p> : null}
      {loading ? <p role="status" style={{ padding: 20 }}>Loading appointments…</p> : <div className="ad-table-wrap">
        <table className="ad-table">
          <thead><tr><th>Patient</th><th>Service</th><th>Doctor</th><th>Requested time</th><th>Notes</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {pageRows.map((appointment) => <tr key={appointment.id}>
              <td><strong>{appointment.patient_display_name}</strong><div style={{ color: "var(--ad-muted)", fontSize: 12 }}>{appointment.email || "No email"}</div><div style={{ color: "var(--ad-muted)", fontSize: 11 }}>{appointment.patient_phone || "No phone number"}</div><div style={{ color: "var(--ad-muted)", fontSize: 11 }}>ID {appointment.patient_id}</div></td>
              <td>{appointment.service_name}</td>
              <td>{appointment.doctor_name}{appointment.doctor_specialty ? <div style={{ color: "var(--ad-muted)", fontSize: 11 }}>{appointment.doctor_specialty}</div> : null}{appointment.doctor_department ? <div style={{ color: "var(--ad-muted)", fontSize: 11 }}>{appointment.doctor_department}</div> : null}</td>
              <td>{new Date(`${appointment.appointment_date}T${appointment.appointment_time}`).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
              <td>{appointment.notes || "—"}</td>
              <td><span className={`ad-badge ${appointment.status === "confirmed" ? "ad-badge-green" : appointment.status === "completed" ? "ad-badge-blue" : appointment.status === "cancelled" ? "ad-badge-gray" : "ad-badge-yellow"}`}>{appointment.status}</span></td>
              <td><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {appointment.status === "pending" ? <>
                  <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" disabled={savingId !== null} onClick={() => void updateStatus(appointment, "confirmed")}>{savingId === appointment.id ? "Saving…" : "Confirm"}</button>
                  <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={savingId !== null} onClick={() => void updateStatus(appointment, "cancelled")}>{savingId === appointment.id ? "Saving…" : "Reject"}</button>
                </> : null}
              </div></td>
            </tr>)}
            {!pageRows.length ? <tr><td colSpan={7}><div className="ad-empty"><h3>{filtered.length ? "No appointments on this page" : "No matching appointments"}</h3><p>Appointment requests will appear here when available.</p></div></td></tr> : null}
          </tbody>
        </table>
      </div>}
      {!loading && !error && filtered.length ? <div className="ad-toolbar" style={{ justifyContent: "space-between" }}><span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}</span><div style={{ display: "flex", gap: 8 }}><button className="ad-btn ad-btn-ghost ad-btn-sm" type="button" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button><span style={{ alignSelf: "center" }}>Page {page + 1} of {pages}</span><button className="ad-btn ad-btn-ghost ad-btn-sm" type="button" disabled={page + 1 >= pages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div> : null}
    </div>
  </AdminShell>;
}
