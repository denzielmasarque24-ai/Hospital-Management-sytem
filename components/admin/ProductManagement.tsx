"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Product } from "@/lib/admin/mockData";
import { loadProducts, removeProduct, saveProduct } from "@/lib/admin/products";
import { formatPhp } from "@/lib/currency";
import { removeUploadedProductImage, uploadProductImage, validateProductImage } from "@/lib/admin/product-image";

const CATEGORIES = ["All", "Prescription Medicines", "Over-the-Counter", "Vitamins & Supplements", "Medical Devices", "Personal Care", "Wellness Products"];
const EMPTY_PRODUCT: Omit<Product, "id"> = { name: "", sku: "", category: "Prescription Medicines", price: 0, stock: 0, minStock: 20, status: "active", description: "", image: "", expirationDate: "" };

export function ProductManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [dataSource, setDataSource] = useState<"database" | "sample">("database");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [modal, setModal] = useState<"add" | "edit" | "delete" | "view" | null>(null);
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<Omit<Product, "id">>(EMPTY_PRODUCT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modal !== "add" && modal !== "edit") setImageFile(null);
  }, [modal]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }
    const preview = URL.createObjectURL(imageFile);
    setImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [imageFile]);

  const notify = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    let active = true;
    void loadProducts().then(({ products: rows, source, error }) => {
      if (!active) return;
      setProducts(rows);
      setDataSource(source);
      if (error) notify(`Could not load products: ${error}`, "error");
    });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "All" || product.category === category;
      const matchesSearch = !search || [product.name, product.sku, product.category, product.description].some((value) => value.toLowerCase().includes(search));
      return matchesCategory && matchesSearch;
    });
  }, [products, query, category]);

  const openAdd = () => { setSelected(null); setForm(EMPTY_PRODUCT); setImageFile(null); setErrors({}); setModal("add"); };
  const openEdit = (product: Product) => {
    setSelected(product);
    setForm({ name: product.name, slug: product.slug, sku: product.sku, category: product.category, price: product.price, stock: product.stock, minStock: product.minStock, status: product.status, description: product.description, image: product.image ?? "", expirationDate: product.expirationDate ?? "" });
    setImageFile(null);
    setErrors({});
    setModal("edit");
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Product name is required.";
    if (!form.sku.trim()) next.sku = "SKU is required.";
    if (!Number.isFinite(form.price) || form.price < 0) next.price = "Enter a valid non-negative price.";
    if (!Number.isInteger(form.stock) || form.stock < 0) next.stock = "Enter a valid non-negative quantity.";
    if (!Number.isInteger(form.minStock) || form.minStock < 0) next.minStock = "Enter a valid non-negative quantity.";
    if (errors.image) next.image = errors.image;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const chooseImage = (file?: File) => {
    if (!file) return;
    const error = validateProductImage(file);
    if (error) {
      setImageFile(null);
      setErrors((current) => ({ ...current, image: error }));
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    setErrors((current) => { const { image: _imageError, ...rest } = current; return rest; });
    setImageFile(file);
  };

  const save = async () => {
    if (!validate() || saving) return;
    setSaving(true);
    let uploadedImage: Awaited<ReturnType<typeof uploadProductImage>> | null = null;
    try {
      let productToSave = { ...form };
      if (imageFile) {
        setIsUploading(true);
        try {
          uploadedImage = await uploadProductImage(imageFile);
        } finally {
          setIsUploading(false);
        }
        productToSave = { ...productToSave, image: uploadedImage.publicUrl };
      }
      if (dataSource === "sample") {
        if (modal === "edit" && selected) setProducts((items) => items.map((item) => item.id === selected.id ? { ...item, ...productToSave } : item));
        else setProducts((items) => [{ ...productToSave, id: `SAMPLE-${Date.now()}` }, ...items]);
        notify("Sample data updated in this session only. Connect the products table for persistent changes.");
      } else {
        const saved = await saveProduct(productToSave, modal === "edit" ? selected?.id : undefined);
        setProducts((items) => modal === "edit" ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
        notify(modal === "edit" ? "Product updated." : "Product added.");
      }
      setModal(null);
    } catch (error) {
      if (uploadedImage) {
        try { await removeUploadedProductImage(uploadedImage.path); } catch { /* Keep the original save error visible. */ }
      }
      notify(error instanceof Error ? error.message : "Product could not be saved.", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      if (dataSource === "sample") {
        setProducts((items) => items.filter((item) => item.id !== selected.id));
        notify("Sample product removed for this session only.");
      } else {
        await removeProduct(selected.id);
        setProducts((items) => items.filter((item) => item.id !== selected.id));
        notify("Product deleted.");
      }
      setModal(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Product could not be deleted.", "error");
    } finally {
      setSaving(false);
    }
  };

  const statusClass = (status: Product["status"]) => status === "active" ? "ad-badge-green" : status === "inactive" ? "ad-badge-red" : "ad-badge-gray";

  return (
    <>
      <section className="ad-products-page">
        <div className="ad-page-header">
          <div><h1>Product List</h1><p>Add, edit, review, and manage products, images, and stock quantities.</p></div>
          {dataSource === "sample" && <span className="ad-sample-note">Sample catalog · changes are session only</span>}
          <button type="button" className="ad-btn ad-btn-primary" onClick={openAdd}>+ Add Product</button>
        </div>

        <div className="ad-card">
          <div className="ad-products-toolbar">
            <input className="ad-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products by name, SKU, or description" aria-label="Search products" />
            <select className="ad-select" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter products by category">
              {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>

          <div className="ad-product-grid">
            {filtered.map((product) => (
              <article className="ad-product-card" key={product.id}>
                <div className="ad-product-image-wrap">
                  {product.image ? <img className="ad-product-image" src={product.image} alt={product.name} /> : <div className="ad-product-placeholder">No image</div>}
                  <span className={`ad-product-status ad-badge ${statusClass(product.status)}`}>{product.status}</span>
                </div>
                <div className="ad-product-body">
                  <span className="ad-product-category">{product.category}</span>
                  <h2>{product.name}</h2>
                  <p className="ad-product-description">{product.description}</p>
                  <strong className="ad-product-price">{formatPhp(product.price)}</strong>
                  <div className="ad-product-meta"><span>SKU <b>{product.sku}</b></span><span>Stock <b>{product.stock}</b></span></div>
                  <div className="ad-product-actions">
                    <button type="button" className="ad-btn ad-btn-primary ad-btn-sm" onClick={() => { setSelected(product); setModal("view"); }}>View Product</button>
                    <button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => openEdit(product)}>Edit</button>
                    <button type="button" className="ad-btn ad-btn-danger ad-btn-sm" onClick={() => { setSelected(product); setModal("delete"); }}>Delete</button>
                  </div>
                </div>
              </article>
            ))}
            {filtered.length === 0 && <div className="ad-empty"><h3>No products found</h3><p>Try another search or category.</p></div>}
          </div>
        </div>
      </section>

      {(modal === "add" || modal === "edit") && (
        <div className="ad-modal-backdrop" onClick={() => !saving && setModal(null)}>
          <div className="ad-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title" onClick={(event) => event.stopPropagation()}>
            <div className="ad-modal-header"><span id="product-form-title" className="ad-modal-title">{modal === "add" ? "Add Product" : "Edit Product"}</span><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={saving} onClick={() => setModal(null)} aria-label="Close">×</button></div>
            <div className="ad-modal-body"><div className="ad-form"><div className="ad-form-grid">
              <FormField label="Product Name" error={errors.name}><input className="ad-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FormField>
              <FormField label="SKU" error={errors.sku}><input className="ad-input" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></FormField>
              <FormField label="Category"><select className="ad-select" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{CATEGORIES.filter((item) => item !== "All").map((item) => <option key={item}>{item}</option>)}</select></FormField>
              <FormField label="Price (PHP ₱)" error={errors.price}><input className="ad-input" type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} /></FormField>
              <FormField label="Stock Quantity" error={errors.stock}><input className="ad-input" type="number" min="0" step="1" value={form.stock} onChange={(event) => setForm({ ...form, stock: Number(event.target.value) })} /></FormField>
              <FormField label="Minimum Stock" error={errors.minStock}><input className="ad-input" type="number" min="0" step="1" value={form.minStock} onChange={(event) => setForm({ ...form, minStock: Number(event.target.value) })} /></FormField>
              <FormField label="Expiry Date (optional)"><input className="ad-input" type="date" value={form.expirationDate ?? ""} onChange={(event) => setForm({ ...form, expirationDate: event.target.value })} /></FormField>
              <FormField label="Status"><select className="ad-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Product["status"] })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="draft">Draft</option></select></FormField>
            </div><FormField label="Description"><textarea className="ad-textarea" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></FormField></div></div>
            <div className="ad-product-image-upload">
              <span className="ad-label">Product Image</span>
              <div className="ad-product-upload-preview">{imagePreview || form.image ? <img src={imagePreview || form.image} alt="Product preview" /> : <div className="ad-product-placeholder">Image preview</div>}</div>
              <input ref={imageInputRef} className="ad-product-file-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { chooseImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} aria-label="Choose product image" />
              <div className="ad-product-upload-controls"><button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={() => imageInputRef.current?.click()}>{imageFile || form.image ? "Replace Image" : "Choose Image"}</button><span>{imageFile ? imageFile.name : form.image ? "Current product image" : "JPG, PNG, or WebP · max 5 MB"}</span></div>
              {errors.image && <span className="ad-field-error">{errors.image}</span>}
              {isUploading && <span className="ad-product-uploading" role="status"><span className="ad-upload-spinner" /> Uploading image…</span>}
            </div>
            <div className="ad-modal-footer"><button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button type="button" className="ad-btn ad-btn-primary" disabled={saving} onClick={() => void save()}>{isUploading ? "Uploading image…" : saving ? "Saving…" : modal === "add" ? "Add Product" : "Save Changes"}</button></div>
          </div>
        </div>
      )}

      {modal === "view" && selected && <div className="ad-modal-backdrop" onClick={() => setModal(null)}><div className="ad-modal" role="dialog" aria-modal="true" aria-labelledby="product-view-title" onClick={(event) => event.stopPropagation()}><div className="ad-modal-header"><span id="product-view-title" className="ad-modal-title">Product Details</span><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setModal(null)} aria-label="Close">×</button></div><div className="ad-modal-body">{selected.image && <img className="ad-product-view-image" src={selected.image} alt={selected.name} />}{[["Name", selected.name], ["SKU", selected.sku], ["Category", selected.category], ["Price", formatPhp(selected.price)], ["Stock", selected.stock], ["Minimum stock", selected.minStock], ["Expiry date", selected.expirationDate || "Not set"], ["Status", selected.status], ["Description", selected.description]].map(([label, value]) => <div className="ad-product-detail-row" key={label}><b>{label}</b><span>{value}</span></div>)}</div><div className="ad-modal-footer"><button type="button" className="ad-btn ad-btn-ghost" onClick={() => setModal(null)}>Close</button><button type="button" className="ad-btn ad-btn-primary" onClick={() => openEdit(selected)}>Edit Product</button></div></div></div>}

      {modal === "delete" && selected && <div className="ad-modal-backdrop" onClick={() => !saving && setModal(null)}><div className="ad-modal ad-product-confirm" role="dialog" aria-modal="true" aria-labelledby="product-delete-title" onClick={(event) => event.stopPropagation()}><div className="ad-modal-header"><span id="product-delete-title" className="ad-modal-title">Delete Product</span></div><div className="ad-modal-body"><p>Delete <strong>{selected.name}</strong>? This action cannot be undone.</p></div><div className="ad-modal-footer"><button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button type="button" className="ad-btn ad-btn-danger" disabled={saving} onClick={() => void deleteProduct()}>{saving ? "Deleting…" : "Delete Product"}</button></div></div></div>}

      {toast && <div className="ad-toast-wrap" role="status"><div className={`ad-toast ad-toast-${toast.type}`}>{toast.message}</div></div>}
    </>
  );
}

function FormField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="ad-form-row"><label className="ad-label">{label}</label>{children}{error && <span className="ad-field-error">{error}</span>}</div>;
}
