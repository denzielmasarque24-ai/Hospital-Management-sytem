"use client";

import { useState, useMemo, useEffect } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { type Customer } from "@/lib/admin/mockData";
import { loadCustomers, updateCustomerStatus } from "@/lib/admin/customers";
import { formatPhp } from "@/lib/currency";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dataSource, setDataSource] = useState<"database" | "sample">("database");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<Customer | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadCustomers().then(({ customers: rows, source, error }) => { setCustomers(rows); setDataSource(source); if (error) setNotice(error); }); }, []);

  const toggleStatus = async (customer: Customer) => {
    const status = customer.status === "active" ? "inactive" : "active";
    try {
      if (dataSource === "database") await updateCustomerStatus(customer.id, status);
      setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, status } : item));
      setNotice(dataSource === "sample" ? "Changed for this session only; connect Supabase for permanent updates" : "Customer status updated");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update customer"); }
  };

  const filtered = useMemo(() =>
    customers.filter((c) =>
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      c.email.toLowerCase().includes(query.toLowerCase())
    ), [customers, query]);

  return (
    <AdminShell title="Customers">
      <div className="ad-page-header">
        <div><h1>Customers</h1><p>View and manage customer accounts.</p></div>
        <span className="ad-sample-note">⚠ Sample data</span>
      </div>

      <div className="ad-card">
        <div className="ad-toolbar">
          <div className="ad-toolbar-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input placeholder="Search by name or email…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr><th>Customer</th><th>Phone</th><th>Orders</th><th>Total Spent</th><th>Status</th><th>Joined</th><th>Action</th></tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280" }}>{c.email}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{c.phone}</td>
                  <td style={{ fontWeight: 600 }}>{c.orders}</td>
                  <td style={{ fontWeight: 700 }}>{formatPhp(c.spent)}</td>
                  <td>
                    <span className={`ad-badge ${c.status === "active" ? "ad-badge-green" : "ad-badge-gray"}`} style={{ textTransform: "capitalize" }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "#6b7280" }}>{c.joined}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setView(c)}>View</button><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => void toggleStatus(c)}>{c.status === "active" ? "Deactivate" : "Activate"}</button></div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7}><div className="ad-empty"><div className="ad-empty-icon">👥</div><h3>No customers found</h3></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {view && (
        <div className="ad-modal-backdrop" onClick={() => setView(null)}>
          <div className="ad-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ad-modal-header">
              <span className="ad-modal-title">Customer Profile</span>
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm ad-btn-icon" onClick={() => setView(null)}>✕</button>
            </div>
            <div className="ad-modal-body">
              {[
                ["ID", view.id], ["Name", view.name], ["Email", view.email],
                ["Phone", view.phone], ["Total Orders", view.orders],
                ["Total Spent", formatPhp(view.spent)], ["Status", view.status], ["Joined", view.joined],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                  <span style={{ width: 110, fontSize: 12, fontWeight: 700, color: "#6b7280", flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 13, color: "#111827" }}>{String(v)}</span>
                </div>
              ))}
            </div>
            <div className="ad-modal-footer">
              <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setView(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {notice && <p style={{ marginTop: 12, color: "#6b7280", fontSize: 12 }}>{notice}</p>}
    </AdminShell>
  );
}
