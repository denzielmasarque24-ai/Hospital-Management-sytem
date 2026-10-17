"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/lib/supabase/client";

type Supplier = { id: string; name: string; company: string; email: string; phone: string; status: "active" | "inactive"; notes: string };
type SupplierForm = Omit<Supplier, "id">;
const emptySupplier: SupplierForm = { name: "", company: "", email: "", phone: "", status: "active", notes: "" };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<SupplierForm>(emptySupplier);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setError("Connect Supabase and apply the admin dashboard migration to manage suppliers."); setLoading(false); return; }
    setLoading(true);
    const { data, error: loadError } = await supabase.from("suppliers").select("id,name,company,email,phone,status,notes").order("name");
    if (loadError) setError(loadError.message);
    else { setSuppliers(data ?? []); setError(""); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!supabase || !form.name.trim()) return;
    const result = editing
      ? await supabase.from("suppliers").update(form).eq("id", editing)
      : await supabase.from("suppliers").insert(form);
    if (result.error) { setError(result.error.message); return; }
    setForm(emptySupplier); setEditing(null); await load();
  };

  const remove = async (id: string) => {
    if (!supabase || !window.confirm("Remove this supplier?")) return;
    const { error: removeError } = await supabase.from("suppliers").delete().eq("id", id);
    if (removeError) setError(removeError.message); else await load();
  };

  const visible = suppliers.filter((supplier) => `${supplier.name} ${supplier.company} ${supplier.email}`.toLowerCase().includes(query.toLowerCase()));

  return <AdminShell title="Suppliers">
    <div className="ad-page-header"><div><h1>Suppliers</h1><p>Maintain supplier contacts for purchasing and inventory replenishment.</p></div></div>
    <div className="ad-grid-2" style={{ alignItems: "start" }}>
      <div className="ad-card"><div className="ad-card-header"><span className="ad-card-title">{editing ? "Edit Supplier" : "Add Supplier"}</span></div><div className="ad-card-body ad-form">
        <label className="ad-form-row"><span className="ad-label">Supplier name *</span><input className="ad-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="ad-form-row"><span className="ad-label">Company</span><input className="ad-input" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
        <label className="ad-form-row"><span className="ad-label">Email</span><input className="ad-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="ad-form-row"><span className="ad-label">Phone</span><input className="ad-input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label className="ad-form-row"><span className="ad-label">Status</span><select className="ad-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Supplier["status"] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label className="ad-form-row"><span className="ad-label">Notes</span><textarea className="ad-textarea" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="ad-btn ad-btn-primary" onClick={() => void save()} disabled={!form.name.trim()}>{editing ? "Save Supplier" : "Add Supplier"}</button>{editing && <button type="button" className="ad-btn ad-btn-ghost" onClick={() => { setEditing(null); setForm(emptySupplier); }}>Cancel</button>}</div>
      </div></div>
      <div className="ad-card"><div className="ad-card-header"><span className="ad-card-title">Supplier Directory</span><input className="ad-input" style={{ maxWidth: 240 }} placeholder="Search suppliers" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>Supplier</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {visible.map((supplier) => <tr key={supplier.id}><td><strong>{supplier.name}</strong><div>{supplier.company}</div></td><td>{supplier.email}<div>{supplier.phone}</div></td><td>{supplier.status}</td><td><button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => { setEditing(supplier.id); setForm({ name: supplier.name, company: supplier.company, email: supplier.email, phone: supplier.phone, status: supplier.status, notes: supplier.notes }); }}>Edit</button> <button className="ad-btn ad-btn-danger ad-btn-sm" onClick={() => void remove(supplier.id)}>Delete</button></td></tr>)}
        {!loading && visible.length === 0 && <tr><td colSpan={4}><div className="ad-empty">No suppliers found yet.</div></td></tr>}
      </tbody></table></div></div>
    </div>
    {loading && <p style={{ padding: 16 }}>Loading suppliers…</p>}{error && <div className="ad-toast-wrap"><div className="ad-toast ad-toast-error">{error}</div></div>}
  </AdminShell>;
}
