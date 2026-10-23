"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type Patient = { patient_id: string; full_name: string | null; email: string | null; phone: string | null };
type BillLine = { description: string; category: string; quantity: string; unitPrice: string };
type CreatedBill = { id: string; patientId: string; approved: boolean };
type DbError = { code?: string; message?: string; details?: string; hint?: string };

const categories = ["room", "consultation", "laboratory", "diagnostic", "medicine", "medical_supply", "other"];

function errorMessage(error: DbError) {
  return [error.code ? `(${error.code})` : "", error.message || "The request failed.", error.details, error.hint ? `Hint: ${error.hint}` : ""]
    .filter(Boolean).join(" ");
}

export function CreatePatientBill() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientError, setPatientError] = useState("");
  const [patientId, setPatientId] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<BillLine[]>([{ description: "", category: "other", quantity: "1", unitPrice: "" }]);
  const [discount, setDiscount] = useState("0");
  const [taxes, setTaxes] = useState("0");
  const [saving, setSaving] = useState(false);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdBill, setCreatedBill] = useState<CreatedBill | null>(null);
  const externalReference = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (!supabase) {
          if (active) { setPatients([]); setPatientError("Supabase is not configured."); setPatientsLoading(false); }
          return;
        }
        setPatientsLoading(true);
        setPatientError("");
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (authError || !user) throw authError || new Error("Sign in with a billing-authorized account to create a bill.");
          const { data, error: directoryError } = await supabase.rpc("billing_patient_directory", {
            p_search: patientSearch.trim(),
            p_limit: 100,
            p_offset: 0,
          });
          if (directoryError) throw directoryError;
          if (!Array.isArray(data)) throw new Error("The billing patient directory returned an invalid response.");
          if (active) setPatients(data as Patient[]);
        } catch (cause) {
          const failure = cause as DbError;
          console.error("[CreatePatientBill] Patient directory failed", {
            code: failure?.code,
            message: failure?.message ?? String(cause),
            details: failure?.details,
            hint: failure?.hint,
          });
          if (active) { setPatients([]); setPatientError(errorMessage(failure)); }
        } finally {
          if (active) setPatientsLoading(false);
        }
      })();
    }, patientSearch ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [patientSearch]);

  const updateLine = (index: number, field: keyof BillLine, value: string) => {
    setLines((current) => current.map((line, i) => i === index ? { ...line, [field]: value } : line));
  };

  async function createBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setNotice("");
    if (!supabase) { setError("Supabase is not configured."); return; }
    if (!patientId) { setError("Select the patient who received these verified charges."); return; }
    const items = lines.map((line) => ({
      description: line.description.trim(),
      category: line.category,
      quantity: Number(line.quantity),
      unit_price: Number(line.unitPrice),
    }));
    if (!items.length || items.some((item) => !item.description || !categories.includes(item.category) || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unit_price) || item.unit_price < 0)) {
      setError("Enter a description, positive quantity, and nonnegative verified price for every charge.");
      return;
    }
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const discountAmount = Number(discount);
    const taxAmount = Number(taxes);
    if (!Number.isFinite(subtotal) || !Number.isFinite(discountAmount) || discountAmount < 0 || !Number.isFinite(taxAmount) || taxAmount < 0 || discountAmount > subtotal) {
      setError("Check the charge totals, discount, and taxes or fees.");
      return;
    }

    setSaving(true);
    externalReference.current ??= crypto.randomUUID();
    try {
      const { data: billIdResult, error: saveError } = await supabase.rpc("billing_create_patient_bill", {
        p_patient_id: patientId,
        p_admission_id: null,
        p_description: description.trim() || "Hospital charges",
        p_discount: discountAmount,
        p_taxes: taxAmount,
        p_items: items,
        p_external_reference: externalReference.current,
      });
      if (saveError) throw saveError;
      if (typeof billIdResult !== "string" || !billIdResult) throw new Error("Bill creation returned no bill ID.");
      setCreatedBill({ id: billIdResult, patientId, approved: false });
      setNotice("Bill created as a real, unapproved bill. The patient can see its itemized charges; validate the bill before staff record a payment.");
      setDescription(""); setLines([{ description: "", category: "other", quantity: "1", unitPrice: "" }]); setDiscount("0"); setTaxes("0");
      externalReference.current = null;
    } catch (cause) {
      const failure = cause as DbError;
      console.error("[CreatePatientBill] Bill creation failed", {
        code: failure?.code,
        message: failure?.message ?? String(cause),
        details: failure?.details,
        hint: failure?.hint,
      });
      setError(errorMessage(failure));
    } finally { setSaving(false); }
  }

  async function approveBill() {
    if (!supabase || !createdBill || createdBill.approved) return;
    setApprovalSaving(true); setError(""); setNotice("");
    try {
      const { error: approvalError } = await supabase.rpc("billing_approve_patient_bill", { p_bill_id: createdBill.id });
      if (approvalError) throw approvalError;
      setCreatedBill({ ...createdBill, approved: true });
      setNotice("The genuine bill passed billing validation. Authorized staff can now record payments received by the hospital.");
    } catch (cause) {
      const failure = cause as DbError;
      console.error("[CreatePatientBill] Bill approval failed", {
        code: failure?.code,
        message: failure?.message ?? String(cause),
        details: failure?.details,
        hint: failure?.hint,
      });
      setError(errorMessage(failure));
    } finally { setApprovalSaving(false); }
  }

  return <section className="ad-card mw-panel" aria-labelledby="create-patient-bill-title">
    <div className="ad-page-header" style={{ marginBottom: 14 }}>
      <div><h2 id="create-patient-bill-title">Create Patient Bill</h2><p>Record only genuine hospital charges supported by the patient’s care record. No demo or sample charges are created here.</p></div>
    </div>

    {patientError && <p className="mw-errors" role="alert">Could not load patients: {patientError}</p>}
    {!patientError && <div className="ad-form-grid" style={{ marginBottom: 18 }}>
      <label>Find patient<input type="search" value={patientSearch} onChange={(event) => { setPatientSearch(event.target.value); setPatientId(""); setCreatedBill(null); }} placeholder="Search name, patient ID, email, or phone"/></label>
      <label>Patient<select required value={patientId} onChange={(event) => setPatientId(event.target.value)} disabled={patientsLoading || patients.length === 0}>
        <option value="">{patientsLoading ? "Loading patients…" : patients.length ? "Select a patient" : "No matching patients"}</option>
        {patients.map((patient) => <option key={patient.patient_id} value={patient.patient_id}>{patient.full_name?.trim() || "Name not provided"}{patient.email ? ` · ${patient.email}` : ""}</option>)}
      </select></label>
      <span role="status" className="patient-muted">{patientsLoading ? "Searching patient accounts…" : `${patients.length} patient${patients.length === 1 ? "" : "s"} shown`}</span>
    </div>}

    <form className="ad-form-grid" onSubmit={createBill}>
      <label>Bill description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Hospital services and care charges" maxLength={300}/></label>
      {lines.map((line, index) => <fieldset key={index} className="ad-form-span" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, border: "1px solid var(--ad-border)", borderRadius: 10, padding: 12 }}>
        <legend>Verified charge {index + 1}</legend>
        <label>Charge description<input required value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} maxLength={300}/></label>
        <label>Category<select value={line.category} onChange={(event) => updateLine(index, "category", event.target.value)}>{categories.map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></label>
        <label>Quantity<input type="number" min="0.001" step="0.001" required value={line.quantity} onChange={(event) => updateLine(index, "quantity", event.target.value)}/></label>
        <label>Unit price (₱)<input type="number" min="0" step="0.01" required value={line.unitPrice} onChange={(event) => updateLine(index, "unitPrice", event.target.value)}/></label>
        <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={lines.length === 1 || saving} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Remove charge</button>
      </fieldset>)}
      <button type="button" className="ad-btn ad-btn-ghost ad-form-span" disabled={saving} onClick={() => setLines((current) => [...current, { description: "", category: "other", quantity: "1", unitPrice: "" }])}>Add another charge</button>
      <label>Discount (₱)<input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)}/></label>
      <label>Taxes / fees (₱)<input type="number" min="0" step="0.01" value={taxes} onChange={(event) => setTaxes(event.target.value)}/></label>
      <button className="ad-btn ad-btn-primary ad-form-span" disabled={saving || patientsLoading || Boolean(patientError) || !patientId}>{saving ? "Creating bill…" : "Create genuine patient bill"}</button>
    </form>

    {error && <p className="mw-errors" role="alert">{error}</p>}
    {notice && <p className="ad-content-alert success" role="status">{notice}</p>}
    {createdBill && <div className="ad-card" style={{ marginTop: 14, padding: 14 }}>
      <strong>{createdBill.approved ? "Bill approved for payment recording" : "Bill created; review required"}</strong>
      <p>Bill ID: <code>{createdBill.id}</code></p>
      {!createdBill.approved && <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => void approveBill()} disabled={approvalSaving}>{approvalSaving ? "Validating bill…" : "Validate charges and authorize payment recording"}</button>}
      <Link className="ad-btn ad-btn-ghost ad-btn-sm" style={{ marginLeft: 8 }} href={`/admin/patients/${encodeURIComponent(createdBill.patientId)}`}>Review patient billing</Link>
    </div>}
  </section>;
}
