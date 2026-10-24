"use client";

import { AdminShell } from "@/components/admin/AdminShell";
import { CreatePatientBill } from "@/components/admin/CreatePatientBill";
import "../admin.css";
import "./billing.css";

function PatientPaymentsPage() {
  return <div className="mw-dashboard mw-billing-page">
    <header className="mw-billing-heading"><div><span>FINANCE &amp; CARE</span><h1>Patient Payments &amp; Billing</h1><p>Create and manage verified hospital bills based on patient services, medical products, room assignments, and professional fees.</p></div><div className="mw-billing-heading-icon" aria-hidden="true">₱</div></header>
    <CreatePatientBill />
  </div>;
}

export default function AdminPaymentsPage() {
  return <AdminShell title="Patient Payments" patientAccessOnly><PatientPaymentsPage /></AdminShell>;
}
