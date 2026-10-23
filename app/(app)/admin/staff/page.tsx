"use client";

import { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { SAMPLE_STAFF, type StaffMember, ROLE_LABELS } from "@/lib/admin/mockData";

const empty: Omit<StaffMember, "id" | "joined"> = { name: "", email: "", role: "sales_staff", status: "active" };

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>(SAMPLE_STAFF);
  const [modal, setModal] = useState<"add" | "edit" | "delete" | null>(null);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [form, setForm] = useState<Omit<StaffMember, "id" | "joined">>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    if (modal === "add") {
      setStaff((prev) => [...prev, { ...form, id: `S${String(prev.length + 1).padStart(3, "0")}`, joined: new Date().toISOString().slice(0, 10) }]);
      showToast("Staff member added");
    } else if (modal === "edit" && selected) {
      setStaff((prev) => prev.map((s) => s.id === selected.id ? { ...s, ...form } : s));
      showToast("Staff member updated");
    }
    setModal(null);
  };

  const roleBadge = (role: StaffMember["role"]) => {
    const map: Record<StaffMember["role"], string> = {
      super_admin: "ad-badge-red", admin: "ad-badge-blue",
      inventory_manager: "ad-badge-purple", sales_staff: "ad-badge-green",
    };
    return map[role];
  };

  return (
    <AdminShell title="Staff">
      <div className="ad-page-header">
        <div><h1>Staff Management</h1><p>Manage admin users and their roles.</p></div>
        <button type="button" className="ad-btn ad-btn-primary" onClick={() => { setForm(empty); setErrors({}); setModal("add"); }}>+ Add Staff</button>
      </div>

      <div className="ad-card">
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td style={{ fontSize: 12, color: "var(--ad-muted)" }}>{s.email}</td>
                  <td><span className={`ad-badge ${roleBadge(s.role)}`}>{ROLE_LABELS[s.role]}</span></td>
                  <td><span className={`ad-badge ${s.status === "active" ? "ad-badge-green" : "ad-badge-gray"}`} style={{ textTransform: "capitalize" }}>{s.status}</span></td>
                  <td style={{ fontSize: 12, color: "var(--ad-muted)" }}>{s.joined}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => { setSelected(s); setForm({ name: s.name, email: s.email, role: s.role, status: s.status }); setErrors({}); setModal("edit"); }}>Edit</button>
                      <button type="button" className="ad-btn ad-btn-danger ad-btn-sm" onClick={() => { setSelected(s); setModal("delete"); }}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(modal === "add" || modal === "edit") && (
        <div className="ad-modal-backdrop" onClick={() => setModal(null)}>
          <div className="ad-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="ad-modal-header">
              <span className="ad-modal-title">{modal === "add" ? "Add Staff Member" : "Edit Staff Member"}</span>
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm ad-btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="ad-modal-body">
              <div className="ad-form">
                <div className="ad-form-row">
                  <label className="ad-label">Full Name *</label>
                  <input className="ad-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  {errors.name && <span className="ad-field-error">{errors.name}</span>}
                </div>
                <div className="ad-form-row">
                  <label className="ad-label">Email *</label>
                  <input className="ad-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  {errors.email && <span className="ad-field-error">{errors.email}</span>}
                </div>
                <div className="ad-form-row">
                  <label className="ad-label">Role</label>
                  <select className="ad-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffMember["role"] })}>
                    {(Object.entries(ROLE_LABELS) as [StaffMember["role"], string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                <div className="ad-form-row">
                  <label className="ad-label">Status</label>
                  <select className="ad-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as StaffMember["status"] })}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="ad-modal-footer">
              <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="button" className="ad-btn ad-btn-primary" onClick={handleSave}>{modal === "add" ? "Add Staff" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {modal === "delete" && selected && (
        <div className="ad-modal-backdrop" onClick={() => setModal(null)}>
          <div className="ad-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="ad-modal-header">
              <span className="ad-modal-title">Remove Staff Member</span>
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm ad-btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="ad-modal-body ad-confirm">
              <div style={{ fontSize: 36 }}>👤</div>
              <p>Remove <strong>{selected.name}</strong> from the admin panel?</p>
            </div>
            <div className="ad-modal-footer">
              <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="button" className="ad-btn ad-btn-danger" onClick={() => { setStaff((prev) => prev.filter((s) => s.id !== selected.id)); showToast("Staff member removed"); setModal(null); }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="ad-toast-wrap"><div className="ad-toast ad-toast-success">{toast}</div></div>}
    </AdminShell>
  );
}
