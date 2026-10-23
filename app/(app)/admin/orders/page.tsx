"use client";

import { useState, useMemo, useEffect } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { type Order, orderStatusBadge, paymentBadge } from "@/lib/admin/mockData";
import { loadOrders, persistOrderStatus } from "@/lib/admin/orders";
import { formatPhp } from "@/lib/currency";

const ORDER_STATUSES: Order["status"][] = ["pending", "processing", "shipped", "completed", "cancelled"];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [dataSource, setDataSource] = useState<"database" | "sample">("database");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Order["status"] | "all">("all");
  const [paymentFilter, setPaymentFilter] = useState<Order["payment"] | "all">("all");
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [updateOrder, setUpdateOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState<Order["status"]>("pending");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => { void loadOrders().then(({ orders: rows, source, error }) => { setOrders(rows); setDataSource(source); if (error) showToast(`Could not load orders: ${error}`); }); }, []);

  const filtered = useMemo(() => orders.filter((o) => {
    const matchQ = o.id.toLowerCase().includes(query.toLowerCase()) || o.customer.toLowerCase().includes(query.toLowerCase());
    const matchS = statusFilter === "all" || o.status === statusFilter;
    const matchP = paymentFilter === "all" || o.payment === paymentFilter;
    return matchQ && matchS && matchP;
  }), [orders, query, statusFilter, paymentFilter]);

  const handleUpdateStatus = async () => {
    if (!updateOrder) return;
    try {
      if (dataSource !== "sample") await persistOrderStatus(updateOrder, newStatus);
      setOrders((prev) => prev.map((o) => o.id === updateOrder.id ? { ...o, status: newStatus } : o));
      showToast(dataSource === "sample" ? "Updated in this session only; connect Supabase for permanent storage" : `Order ${updateOrder.id} updated to ${newStatus}`);
      setUpdateOrder(null);
    } catch (error) { showToast(error instanceof Error ? error.message : "Order could not be updated"); }
  };

  return (
    <AdminShell title="Orders">
      <div className="ad-page-header">
        <div><h1>Orders</h1><p>View and manage customer orders.</p></div>
        <span className="ad-sample-note">⚠ Sample data</span>
      </div>

      <div className="ad-stat-grid" style={{ gridTemplateColumns: "repeat(5,1fr)", marginBottom: 20 }}>
        {ORDER_STATUSES.map((s) => (
          <div key={s} className="ad-stat-card" style={{ cursor: "pointer" }} onClick={() => setStatusFilter(s === statusFilter ? "all" : s)}>
            <div className="ad-stat-body">
              <div className="ad-stat-label" style={{ textTransform: "capitalize" }}>{s}</div>
              <div className="ad-stat-value">{orders.filter((o) => o.status === s).length}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="ad-card">
        <div className="ad-toolbar">
          <div className="ad-toolbar-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input placeholder="Search by order ID or customer…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="ad-select" style={{ width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Order["status"] | "all")}>
            <option value="all">All Statuses</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s} style={{ textTransform: "capitalize" }}>{s}</option>)}
          </select>
          <select className="ad-select" style={{ width: "auto" }} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value as Order["payment"] | "all")}>
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr><th>Order ID</th><th>Customer</th><th>Date</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 700 }}>{o.id}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.customer}</div>
                    <div style={{ fontSize: 11, color: "var(--ad-muted)" }}>{o.email}</div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--ad-muted)" }}>{o.date}</td>
                  <td>{o.items}</td>
                  <td style={{ fontWeight: 700 }}>{formatPhp(o.total)}</td>
                  <td><span className={`ad-badge ${paymentBadge(o.payment)}`} style={{ textTransform: "capitalize" }}>{o.payment}</span></td>
                  <td><span className={`ad-badge ${orderStatusBadge(o.status)}`} style={{ textTransform: "capitalize" }}>{o.status}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setViewOrder(o)}>View</button>
                      <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => { setUpdateOrder(o); setNewStatus(o.status); }}>Update</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8}><div className="ad-empty"><div className="ad-empty-icon">🛒</div><h3>No orders found</h3></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View order */}
      {viewOrder && (
        <div className="ad-modal-backdrop" onClick={() => setViewOrder(null)}>
          <div className="ad-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ad-modal-header">
              <span className="ad-modal-title">Order {viewOrder.id}</span>
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm ad-btn-icon" onClick={() => setViewOrder(null)}>✕</button>
            </div>
            <div className="ad-modal-body">
              {[
                ["Order ID", viewOrder.id], ["Customer", viewOrder.customer], ["Email", viewOrder.email],
                ["Date", viewOrder.date], ["Items", viewOrder.items], ["Total", formatPhp(viewOrder.total)],
                ["Payment", viewOrder.payment], ["Status", viewOrder.status],
              ].map(([k, v]) => (
                <div key={String(k)} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--ad-border)" }}>
                  <span style={{ width: 100, fontSize: 12, fontWeight: 700, color: "var(--ad-muted)", flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 13, color: "var(--ad-text)", textTransform: "capitalize" }}>{String(v)}</span>
                </div>
              ))}
            </div>
            <div className="ad-modal-footer">
              <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setViewOrder(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Update status */}
      {updateOrder && (
        <div className="ad-modal-backdrop" onClick={() => setUpdateOrder(null)}>
          <div className="ad-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div className="ad-modal-header">
              <span className="ad-modal-title">Update Order Status</span>
              <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm ad-btn-icon" onClick={() => setUpdateOrder(null)}>✕</button>
            </div>
            <div className="ad-modal-body">
              <p style={{ fontSize: 13, color: "var(--ad-muted)", marginBottom: 14 }}>Order: <strong>{updateOrder.id}</strong></p>
              <div className="ad-form-row">
                <label className="ad-label">New Status</label>
                <select className="ad-select" value={newStatus} onChange={(e) => setNewStatus(e.target.value as Order["status"])}>
                  {ORDER_STATUSES.map((s) => <option key={s} value={s} style={{ textTransform: "capitalize" }}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="ad-modal-footer">
              <button type="button" className="ad-btn ad-btn-ghost" onClick={() => setUpdateOrder(null)}>Cancel</button>
              <button type="button" className="ad-btn ad-btn-primary" onClick={handleUpdateStatus}>Update Status</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="ad-toast-wrap">
          <div className="ad-toast ad-toast-success">{toast}</div>
        </div>
      )}
    </AdminShell>
  );
}
