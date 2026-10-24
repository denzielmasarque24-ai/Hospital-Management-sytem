"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Staff = { user_id: string; full_name: string; email: string; role: string; permissions: string[] };
const permissionLabels: Record<string, string> = {
  care_management: "Doctor assignment and care coordination",
  admissions: "Admissions, room, and bed management",
  clinical_author: "Write clinical notes (draft only)",
  clinical_release: "Clinically review and release medical records",
  lab_author: "Create test orders and enter results",
  lab_release: "Clinically review and release laboratory results",
  billing: "Create bills and record payments",
  inventory: "Record patient supply use and deduct stock",
};
function eligible(permission: string, role: string) {
  const clinical = ["DOCTOR", "PHYSICIAN", "CLINICIAN", "CLINICAL_STAFF", "NURSE"];
  const laboratory = ["LAB_TECH", "LAB_TECHNICIAN", "LABORATORY_TECHNICIAN", "PATHOLOGIST", "LAB_SUPERVISOR"];
  const billing = ["BILLING_STAFF", "BILLING_MANAGER", "ACCOUNTANT", "FINANCE_STAFF"];
  if (["clinical_author", "clinical_release"].includes(permission)) return clinical.includes(role);
  if (["lab_author", "lab_release"].includes(permission)) return laboratory.includes(role);
  if (permission === "billing") return billing.includes(role);
  if (permission === "inventory") return role === "INVENTORY_MANAGER";
  if (permission === "admissions") return [...clinical, "ADMISSIONS_STAFF"].includes(role);
  return [...clinical, "CARE_COORDINATOR"].includes(role);
}

export function PatientStaffPermissions() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
    setLoading(true); setError("");
    const { data, error: requestError } = await supabase.rpc("admin_patient_staff_directory");
    if (requestError) { setError(requestError.message); setStaff([]); }
    else setStaff((data ?? []) as Staff[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function toggle(person: Staff, permission: string, granted: boolean) {
    if (!supabase) return;
    setBusy(`${person.user_id}:${permission}`); setError(""); setNotice("");
    const { error: updateError } = await supabase.rpc("admin_set_patient_staff_permission", { p_user_id: person.user_id, p_permission: permission, p_granted: granted });
    if (updateError) setError(`${permissionLabels[permission]}: ${updateError.message}`);
    else setNotice(`${permissionLabels[permission]} ${granted ? "granted" : "removed"} for ${person.full_name}.`);
    await load(); setBusy("");
  }

  return <div className="ad-root" style={{ padding: "20px 0" }}>
    <div className="ad-page-header"><div><h1>Patient Staff Access</h1><p>Grant task-specific patient record access to verified staff roles. Clinical authoring and result release are separate permissions.</p></div><button className="ad-btn ad-btn-ghost" onClick={() => void load()} disabled={loading}>Refresh</button></div>
    {error && <div className="ad-content-alert error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}{notice && <div className="ad-content-alert success" role="status" style={{ marginBottom: 12 }}>{notice}</div>}
    {loading ? <div className="ad-card" role="status" style={{ padding: 20 }}>Loading staff permissions…</div> : staff.length ? <div style={{ display: "grid", gap: 14 }}>{staff.map((person) => <section className="ad-card" key={person.user_id} style={{ padding: 18 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}><div><h2 style={{ margin: 0 }}>{person.full_name}</h2><p style={{ margin: "5px 0 0", color: "var(--ad-muted)" }}>{person.email} · {person.role}</p><code>{person.user_id}</code></div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10 }}>{Object.entries(permissionLabels).filter(([permission]) => eligible(permission, person.role)).map(([permission, label]) => <label key={permission} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: 10, border: "1px solid var(--ad-border)", borderRadius: 9, color: "var(--ad-text)", fontSize: 12 }}><input type="checkbox" checked={person.permissions.includes(permission)} disabled={Boolean(busy)} onChange={(event) => void toggle(person, permission, event.target.checked)}/><span>{label}</span></label>)}</div></section>)}</div> : <div className="ad-card" style={{ padding: 20 }}><h2>No eligible staff accounts</h2><p>To assign sensitive patient permissions, the staff member needs a registered authenticated account and a verified staff role on their public.profiles record.</p></div>}
  </div>;
}
