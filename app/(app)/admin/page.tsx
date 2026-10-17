"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { type Order, type Product, MONTHLY_SALES, orderStatusBadge, paymentBadge, stockBadge } from "@/lib/admin/mockData";
import { loadProducts } from "@/lib/admin/products";
import { loadOrders } from "@/lib/admin/orders";
import { loadCustomers } from "@/lib/admin/customers";
import { formatPhp } from "@/lib/currency";

export default function AdminDashboard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [sales, setSales] = useState(MONTHLY_SALES);
  const [usingSampleData, setUsingSampleData] = useState(false);
  useEffect(() => {
    void Promise.all([loadProducts(), loadOrders(), loadCustomers()]).then(([productData, orderData, customerData]) => {
      setProducts(productData.products); setOrders(orderData.orders); setCustomerCount(customerData.customers.length);
      setUsingSampleData(productData.source === "sample" && orderData.source === "sample");
      if (orderData.source === "database") {
        const monthNames = Array.from({ length: 6 }, (_, index) => new Date(new Date().getFullYear(), new Date().getMonth() - 5 + index, 1).toLocaleString("en", { month: "short" }));
        setSales(monthNames.map((month) => ({ month, revenue: orderData.orders.filter((order) => new Date(order.date).toLocaleString("en", { month: "short" }) === month && order.payment === "paid").reduce((sum, order) => sum + order.total, 0) })));
      }
    });
  }, []);
  const lowStock = products.filter((product) => product.stock < product.minStock);
  const pendingOrders = orders.filter((order) => order.status === "pending").length;
  const totalRevenue = orders.filter((order) => order.payment === "paid").reduce((sum, order) => sum + order.total, 0);
  const maxRev = Math.max(1, ...sales.map((item) => item.revenue));

  return (
    <AdminShell title="Dashboard">
      <div className="ad-page-header">
        <div>
          <h1>Dashboard Overview</h1>
          <p>Welcome back. Here&apos;s what&apos;s happening today.</p>
        </div>
        <span className="ad-sample-note">⚠ Sample data — connect Supabase tables to show real figures</span>
      </div>

      {/* Stat cards */}
      <div className="ad-stat-grid ad-stat-grid-6" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {[
          { label: "Inventory Items", value: products.length, icon: "💊", color: "blue", sub: `${products.filter((product) => product.status === "active").length} active products` },
          { label: "Total Orders", value: orders.length, icon: "🛒", color: "purple", sub: `${pendingOrders} pending` },
          { label: "Total Revenue", value: formatPhp(totalRevenue), icon: "💰", color: "green", sub: "Paid orders only" },
          { label: "Total Customers", value: customerCount, icon: "👥", color: "blue", sub: "Customer records" },
          { label: "Low Stock", value: lowStock.length, icon: "⚠️", color: "yellow", sub: "Need restock" },
          { label: "Pending Orders", value: pendingOrders, icon: "⏳", color: "red", sub: "Awaiting action" },
        ].map((s) => (
          <div key={s.label} className="ad-stat-card">
            <div className={`ad-stat-icon ${s.color}`}>{s.icon}</div>
            <div className="ad-stat-body">
              <div className="ad-stat-label">{s.label}</div>
              <div className="ad-stat-value">{s.value}</div>
              <div className="ad-stat-sub">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="ad-grid-2-1" style={{ marginBottom: 16 }}>
        {/* Sales chart */}
        <div className="ad-card">
          <div className="ad-card-header">
            <span className="ad-card-title">Monthly Revenue</span>
            <span className="ad-sample-note">Sample data</span>
          </div>
          <div className="ad-card-body">
            <div className="ad-chart-wrap" style={{ height: 180 }}>
              <svg viewBox="0 0 600 180" preserveAspectRatio="none">
                {/* Grid lines */}
                {[0, 1, 2, 3].map((i) => (
                  <line key={i} x1="0" y1={i * 45} x2="600" y2={i * 45} stroke="#f3f4f6" strokeWidth="1" />
                ))}
                {/* Bars */}
                {sales.map((d, i) => {
                  const barH = (d.revenue / maxRev) * 150;
                  const x = i * 100 + 10;
                  return (
                    <g key={d.month}>
                      <rect x={x} y={170 - barH} width="80" height={barH} rx="6" fill="#2563eb" opacity="0.85" />
                      <text x={x + 40} y="178" textAnchor="middle" fontSize="11" fill="#6b7280">{d.month}</text>
                      <text x={x + 40} y={165 - barH} textAnchor="middle" fontSize="10" fill="#2563eb">₱{(d.revenue / 1000).toFixed(1)}k</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Order status donut */}
        <div className="ad-card">
          <div className="ad-card-header">
            <span className="ad-card-title">Orders by Status</span>
          </div>
          <div className="ad-card-body">
            {(["completed", "processing", "shipped", "pending", "cancelled"] as const).map((s) => {
              const count = orders.filter((order) => order.status === s).length;
              const pct = (orders.length ? Math.round((count / orders.length) * 100) : 0);
              return (
                <div key={s} style={{ marginBottom: 10 }}>
                  <div className="ad-flex-between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 12, textTransform: "capitalize", color: "#374151" }}>{s}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{count}</span>
                  </div>
                  <div className="ad-stock-bar">
                    <div
                      className={`ad-stock-fill ${s === "completed" ? "high" : s === "cancelled" ? "low" : "medium"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ad-grid-2">
        {/* Recent orders */}
        <div className="ad-card">
          <div className="ad-card-header">
            <span className="ad-card-title">Recent Orders</span>
            <Link href="/admin/orders" className="ad-btn ad-btn-ghost ad-btn-sm">View all</Link>
          </div>
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 5).map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.id}</td>
                    <td>{o.customer}</td>
                    <td>{formatPhp(o.total)}</td>
                    <td>
                      <span className={`ad-badge ${orderStatusBadge(o.status)}`} style={{ textTransform: "capitalize" }}>
                        {o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low stock */}
        <div className="ad-card">
          <div className="ad-card-header">
            <span className="ad-card-title">Low Stock Alerts</span>
            <Link href="/admin/inventory" className="ad-btn ad-btn-ghost ad-btn-sm">View all</Link>
          </div>
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Stock</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p) => {
                  const b = stockBadge(p.stock, p.minStock);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.stock}</td>
                      <td><span className={`ad-badge ${b.cls}`}>{b.label}</span></td>
                    </tr>
                  );
                })}
                {lowStock.length === 0 && (
                  <tr><td colSpan={3} style={{ textAlign: "center", color: "#6b7280", padding: 20 }}>All products are well stocked ✓</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
