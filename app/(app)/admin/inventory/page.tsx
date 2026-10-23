"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ProductManagement } from "@/components/admin/ProductManagement";
import { type Product, stockBadge, stockLevel } from "@/lib/admin/mockData";
import { adjustProductStock, loadProducts } from "@/lib/admin/products";
import { supabase } from "@/lib/supabase/client";

type InventoryTab = "products" | "stock" | "categories" | "suppliers" | "expiry" | "movements";
type Movement = { id: string; product_id: string; quantity: number; note: string; created_at: string };
const tabs: { id: InventoryTab; label: string }[] = [
  { id: "products", label: "Product List" }, { id: "stock", label: "Stock Levels" },
  { id: "categories", label: "Categories" }, { id: "suppliers", label: "Suppliers" },
  { id: "expiry", label: "Expiry Tracking" }, { id: "movements", label: "Stock Movements" },
];

export default function InventoryPage() {
  const [tab, setTab] = useState<InventoryTab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [source, setSource] = useState<"database" | "sample">("database");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<"all" | "low" | "out">("all");
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await loadProducts();
    setProducts(result.products);
    setSource(result.source);
    setError(result.error ?? "");
    if (supabase && result.source === "database") {
      const history = await supabase.from("inventory_adjustments").select("id,product_id,quantity,note,created_at").order("created_at", { ascending: false }).limit(100);
      if (history.error) setMovements([]);
      else setMovements((history.data ?? []) as Movement[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  const lowStock = products.filter((product) => product.stock > 0 && product.stock < product.minStock).length;
  const outOfStock = products.filter((product) => product.stock === 0).length;
  const categories = useMemo(() => Array.from(new Set(products.map((product) => product.category.trim()).filter(Boolean))).sort(), [products]);
  const filtered = useMemo(() => products.filter((product) => {
    const searchMatch = [product.name, product.sku, product.category].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()));
    const levelMatch = level === "all" || (level === "low" && product.stock > 0 && product.stock < product.minStock) || (level === "out" && product.stock === 0);
    return searchMatch && levelMatch;
  }), [products, query, level]);
  const expiringProducts = products.filter((product) => product.expirationDate).sort((a, b) => (a.expirationDate ?? "").localeCompare(b.expirationDate ?? ""));
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3500); };

  const applyAdjustment = async () => {
    if (!adjusting || !quantity || saving) return;
    setSaving(true);
    try {
      if (source === "sample") {
        setProducts((items) => items.map((product) => product.id === adjusting.id ? { ...product, stock: Math.max(0, product.stock + quantity) } : product));
        notify("Sample stock updated for this session.");
      } else {
        await adjustProductStock(adjusting, quantity, note);
        await refresh();
        notify(`Stock adjusted for ${adjusting.name}.`);
      }
      setAdjusting(null); setQuantity(0); setNote("");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Stock adjustment failed.");
    } finally { setSaving(false); }
  };

  return <AdminShell title="Inventory">
    <div className="ad-page-header">
      <div><h1>Inventory</h1><p>Manage products, stock, categories, suppliers, and stock activity.</p></div>
      <button type="button" className="ad-btn ad-btn-ghost" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
    </div>

    <div className="ad-stat-grid" style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))", marginBottom: 18 }}>
      {[{ label: "Inventory Items", value: products.length }, { label: "Low Stock Alerts", value: lowStock }, { label: "Out of Stock", value: outOfStock }].map((stat) => <div className="ad-stat-card" key={stat.label}><div className="ad-stat-body"><div className="ad-stat-label">{stat.label}</div><div className="ad-stat-value">{stat.value}</div></div></div>)}
    </div>

    <div className="ad-card">
      <nav aria-label="Inventory sections" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 12, borderBottom: "1px solid var(--ad-border)" }}>
        {tabs.map((item) => <button key={item.id} type="button" className={`ad-btn ad-btn-sm ${tab === item.id ? "ad-btn-primary" : "ad-btn-ghost"}`} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </nav>
      {error && <div role="alert" style={{ margin: 16, color: "#b91c1c" }}>Could not load inventory data: {error}</div>}
      {loading && <p role="status" style={{ padding: 20 }}>Loading inventory…</p>}
      {!loading && tab === "products" && <ProductManagement onProductsChanged={() => void refresh()} />}
      {!loading && tab === "stock" && <section style={{ padding: 16 }}>
        <div className="ad-toolbar" style={{ flexWrap: "wrap" }}>
          <input className="ad-input" style={{ maxWidth: 320 }} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU, category" aria-label="Search stock" />
          {(["all", "low", "out"] as const).map((option) => <button key={option} type="button" className={`ad-btn ad-btn-sm ${level === option ? "ad-btn-primary" : "ad-btn-ghost"}`} onClick={() => setLevel(option)}>{option === "all" ? "All Stock" : option === "low" ? "Low Stock" : "Out of Stock"}</button>)}
        </div>
        <div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Quantity</th><th>Minimum</th><th>Level</th><th>Action</th></tr></thead><tbody>
          {filtered.map((product) => { const badge = stockBadge(product.stock, product.minStock); const status = stockLevel(product.stock, product.minStock); return <tr key={product.id}><td>{product.name}</td><td>{product.sku || "—"}</td><td>{product.category}</td><td>{product.stock}</td><td>{product.minStock}</td><td><span className={`ad-badge ${badge.cls}`}>{badge.label}</span><div className="ad-stock-bar" style={{ marginTop: 5 }}><div className={`ad-stock-fill ${status}`} style={{ width: `${product.minStock ? Math.min(100, product.stock / (product.minStock * 2) * 100) : 100}%` }} /></div></td><td><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => { setAdjusting(product); setQuantity(0); }}>Adjust</button></td></tr>; })}
          {filtered.length === 0 && <tr><td colSpan={7}><div className="ad-empty"><h3>No matching inventory</h3></div></td></tr>}
        </tbody></table></div>
      </section>}
      {!loading && tab === "categories" && <section style={{ padding: 16 }}><h2 className="ad-card-title">Product Categories</h2><p style={{ color: "var(--ad-muted)", margin: "6px 0 16px" }}>Categories are managed on each product record.</p><div className="ad-stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>{categories.map((category) => <div className="ad-card" key={category} style={{ padding: 16 }}><strong>{category}</strong><p style={{ marginTop: 8, color: "var(--ad-muted)" }}>{products.filter((product) => product.category === category).length} products</p></div>)}{categories.length === 0 && <p>No product categories yet.</p>}</div></section>}
      {!loading && tab === "suppliers" && <section style={{ padding: 24 }}><h2>Supplier Management</h2><p style={{ color: "var(--ad-muted)", margin: "8px 0 16px" }}>Supplier records are shared with the Operations module.</p><Link href="/admin/suppliers" className="ad-btn ad-btn-primary">Open Suppliers</Link></section>}
      {!loading && tab === "expiry" && <section style={{ padding: 16 }}><h2 className="ad-card-title">Expiry Tracking</h2><p style={{ color: "var(--ad-muted)", margin: "6px 0 16px" }}>Expiry dates are not recorded in the current product catalog.</p>{expiringProducts.length ? <div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>Product</th><th>SKU</th><th>Expiry Date</th><th>Stock</th><th>Alert</th></tr></thead><tbody>{expiringProducts.map((product) => { const days = Math.ceil((new Date(`${product.expirationDate}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000); return <tr key={product.id}><td>{product.name}</td><td>{product.sku || "—"}</td><td>{product.expirationDate}</td><td>{product.stock}</td><td><span className={`ad-badge ${days <= 30 ? "ad-badge-red" : "ad-badge-green"}`}>{days < 0 ? "Expired" : days <= 30 ? "Expires soon" : "OK"}</span></td></tr>; })}</tbody></table></div> : <div className="ad-empty"><h3>No expiry dates recorded</h3><p>Add expiry dates through Product List → Edit Product.</p></div>}</section>}
      {!loading && tab === "movements" && <section style={{ padding: 16 }}><h2 className="ad-card-title">Recent Stock Movements</h2>{source === "sample" ? <div className="ad-empty"><h3>Movement history is unavailable in sample mode</h3></div> : movements.length ? <div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>Date</th><th>Product</th><th>Change</th><th>Note</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{new Date(movement.created_at).toLocaleString()}</td><td>{products.find((product) => product.id === movement.product_id)?.name ?? "Product"}</td><td style={{ color: movement.quantity > 0 ? "#15803d" : "#b91c1c", fontWeight: 700 }}>{movement.quantity > 0 ? "+" : ""}{movement.quantity}</td><td>{movement.note || "—"}</td></tr>)}</tbody></table></div> : <div className="ad-empty"><h3>No stock movements recorded</h3></div>}</section>}
    </div>

    {adjusting && <div className="ad-modal-backdrop" onClick={() => !saving && setAdjusting(null)}><div className="ad-modal" style={{ maxWidth: 440 }} role="dialog" aria-modal="true" aria-labelledby="stock-adjust-title" onClick={(event) => event.stopPropagation()}><div className="ad-modal-header"><h2 id="stock-adjust-title" className="ad-modal-title">Adjust Stock</h2></div><div className="ad-modal-body"><p>{adjusting.name} · Current: {adjusting.stock}</p><div className="ad-form"><div className="ad-form-row"><label className="ad-label" htmlFor="adjust-quantity">Quantity change</label><input id="adjust-quantity" className="ad-input" type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /><span>New quantity: {Math.max(0, adjusting.stock + quantity)}</span></div><div className="ad-form-row"><label className="ad-label" htmlFor="adjust-note">Note (optional)</label><textarea id="adjust-note" className="ad-textarea" value={note} onChange={(event) => setNote(event.target.value)} /></div></div></div><div className="ad-modal-footer"><button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={() => setAdjusting(null)}>Cancel</button><button type="button" className="ad-btn ad-btn-primary" disabled={saving || !quantity || adjusting.stock + quantity < 0} onClick={() => void applyAdjustment()}>{saving ? "Saving…" : "Apply Adjustment"}</button></div></div></div>}
    {toast && <div className="ad-toast-wrap" role="status"><div className="ad-toast ad-toast-success">{toast}</div></div>}
  </AdminShell>;
}
