"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { countPatients, listPatients, verifyPatientDirectoryAdmin, type PatientRecord } from "@/lib/admin/patients";

const PAGE_SIZE = 20;

export default function PatientsPage() {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [selected, setSelected] = useState<PatientRecord | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      await verifyPatientDirectoryAdmin();
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setPatients([]);
      setTotal(0);
      setError(cause instanceof Error ? cause.message : "Could not verify administrator access.");
      setLoading(false);
      return;
    }
    const [directoryResult, countResult] = await Promise.allSettled([
      listPatients(query, PAGE_SIZE, page * PAGE_SIZE),
      countPatients(),
    ]);
    if (requestId !== requestRef.current) return;

    if (directoryResult.status === "rejected") {
      const cause = directoryResult.reason;
      setPatients([]);
      setError(cause instanceof Error ? cause.message : "Could not load patient records.");
    } else {
      setPatients(directoryResult.value);
    }

    if (countResult.status === "fulfilled") {
      setTotal(countResult.value);
    } else {
      const cause = countResult.reason;
      console.error("[Admin Patient Accounts] Patient count failed; using directory result count", {
        code: cause?.code,
        message: cause?.message ?? String(cause),
        details: cause?.details,
        hint: cause?.hint,
      });
      setTotal(directoryResult.status === "fulfilled" ? directoryResult.value.length : 0);
      if (directoryResult.status === "fulfilled") {
        setError(`Patient records loaded, but the total count could not be retrieved: ${cause instanceof Error ? cause.message : "Unknown count error"}`);
      }
    }

    if (directoryResult.status === "fulfilled" && countResult.status === "fulfilled") {
      setError("");
    }
    setLoading(false);
  }, [page, query]);

  useEffect(() => { void load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <AdminShell title="Patients" patientAccessOnly>
    <div className="ad-page-header">
      <div><h1>Patient Accounts</h1><p>Registered patient accounts and contact details available to authorized administrators.</p></div>
      <button type="button" className="ad-btn ad-btn-ghost" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
    </div>
    <div className="ad-card">
      <div className="ad-toolbar">
        <div className="ad-toolbar-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input type="search" value={query} onChange={(event) => { setPage(0); setQuery(event.target.value); }} placeholder="Search patient ID, name, email, or phone" aria-label="Search patients" />
        </div>
      </div>
      {error ? <div className="ad-content-alert error" role="alert" style={{ margin: 16 }}>{error.includes("Administrator access required") ? "You do not have permission to view patient accounts." : `Could not load patient accounts: ${error}`}</div> : null}
      {loading ? <p role="status" style={{ padding: 20 }}>Loading patient records…</p> : error ? null : patients.length ? <>
        <div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>Patient ID</th><th>Full Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Actions</th></tr></thead>
          <tbody>{patients.map((patient, index) => <tr key={`${patient.id || patient.email || "patient"}-${index}`}>
            <td><code>{patient.id}</code></td>
            <td><div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>{patient.avatar_url ? <img src={patient.avatar_url} alt="" width={36} height={36} loading="lazy" style={{ flex: "0 0 auto", borderRadius: "50%", objectFit: "cover" }} /> : null}<span>{patient.full_name?.trim() || "Name not provided"}</span></div></td>
            <td>{patient.email || "—"}</td>
            <td>{patient.phone || "—"}</td>
            <td>{patient.role || "PATIENT"}</td>
            <td><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setSelected(patient)}>View Profile</button><Link className="ad-btn ad-btn-primary ad-btn-sm" href={`/admin/patients/${encodeURIComponent(patient.id)}`}>Manage Patient</Link></div></td>
          </tr>)}</tbody>
        </table></div>
        <div className="ad-toolbar" style={{ justifyContent: "space-between" }}><span>{total} registered patient{total === 1 ? "" : "s"}</span><div style={{ display: "flex", alignItems: "center", gap: 8 }}><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((current) => current + 1)}>Next</button></div></div>
      </> : <div className="ad-empty"><h3>{query ? "No patients match this search" : "No registered patient accounts"}</h3><p>Patient accounts will appear here after registration.</p></div>}
    </div>
    {selected ? <div className="ad-modal-backdrop" onClick={() => setSelected(null)}>
      <section className="ad-modal" role="dialog" aria-modal="true" aria-labelledby="patient-detail-title" onClick={(event) => event.stopPropagation()}>
        <div className="ad-modal-header"><h2 className="ad-modal-title" id="patient-detail-title">Patient Details</h2><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setSelected(null)}>Close</button></div>
        <div className="ad-modal-body">{selected.avatar_url ? <img src={selected.avatar_url} alt="Patient profile" width={72} height={72} style={{ borderRadius: "50%", objectFit: "cover" }} /> : null}{[["Patient ID", selected.id], ["Full Name", selected.full_name?.trim() || "Name not provided"], ["Email", selected.email || "—"], ["Contact Number", selected.phone || "—"], ["Role", selected.role || "PATIENT"]].map(([label, value], index) => <div className="ad-product-detail-row" key={`${label}-${index}`}><b>{label}</b><span>{value}</span></div>)}<Link className="ad-btn ad-btn-primary" href={`/admin/appointments?patient=${encodeURIComponent(selected.id)}`} onClick={() => setSelected(null)}>View Appointments</Link></div>
      </section>
    </div> : null}
  </AdminShell>;
}
