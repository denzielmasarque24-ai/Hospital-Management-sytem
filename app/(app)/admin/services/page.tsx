"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Stethoscope } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { deleteService, listServices, saveService, slugifyContent, type Service, type ServiceInput } from "@/lib/admin/managed-content";
import { removeUploadedServiceImage, serviceImagePathFromUrl, uploadServiceImage, validateServiceImage } from "@/lib/admin/service-image";

const EMPTY: ServiceInput = { name: "", slug: "", short_description: "", description: "", image_url: null, available: true };

export default function ServicesManagementPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState<ServiceInput>(EMPTY);
  const [editing, setEditing] = useState<Service | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [preview, setPreview] = useState<Service | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { let active = true; void listServices().then((items) => { if (active) setServices(items); }).catch((reason) => { if (!active) return; const message = reason instanceof Error ? reason.message : "Could not load services."; setError(process.env.NODE_ENV === "development" ? message : "Could not load services. Check your access and try again."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!file) { setPreviewUrl(""); return; }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return services.filter((service) => !normalized || [service.name, service.slug, service.short_description, service.description].some((field) => (field ?? "").toLowerCase().includes(normalized)));
  }, [services, query]);
  const setField = <K extends keyof ServiceInput>(key: K, value: ServiceInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const startAdd = () => { setEditing(null); setForm(EMPTY); setFile(null); setError(""); setNotice(""); setFormOpen(true); };
  const startEdit = (service: Service) => {
    setEditing(service);
    setForm({ name: service.name, slug: service.slug, short_description: service.short_description, description: service.description, image_url: service.image_url, available: service.available });
    setFile(null); setError(""); setNotice(""); setFormOpen(true);
  };
  const closeForm = () => { if (saving) return; setFormOpen(false); setEditing(null); setForm(EMPTY); setFile(null); };
  const selectImage = (selected?: File) => {
    if (!selected) return;
    const message = validateServiceImage(selected);
    if (message) { setFile(null); setError(message); if (fileInput.current) fileInput.current.value = ""; return; }
    setError(""); setFile(selected);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    const slug = slugifyContent(form.slug || name);
    if (!name || !slug || !form.short_description.trim() || !form.description.trim()) {
      setError("Name, slug, short description, and full description are required.");
      return;
    }
    setSaving(true); setError("");
    let uploaded: Awaited<ReturnType<typeof uploadServiceImage>> | null = null;
    let saved: Service | null = null;
    try {
      let imageUrl = form.image_url;
      if (file) {
        setUploading(true);
        uploaded = await uploadServiceImage(file);
        imageUrl = uploaded.publicUrl;
      }
      saved = await saveService({
        name, slug, short_description: form.short_description.trim(),
        description: form.description.trim(), image_url: imageUrl,
        available: form.available,
      }, editing?.id);
      setServices((current) => editing
        ? current.map((item) => item.id === saved!.id ? saved! : item)
        : [...current, saved!].sort((a, b) => a.name.localeCompare(b.name)));
      setNotice(editing ? "Service updated successfully." : "Service added successfully.");
      setFormOpen(false); setEditing(null); setForm(EMPTY); setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (reason) {
      if (uploaded && !saved) {
        try { await removeUploadedServiceImage(uploaded.path); } catch { /* Keep the save error visible. */ }
      }
      setError(reason instanceof Error ? reason.message : "Could not save service.");
    } finally {
      setUploading(false); setSaving(false);
    }
    if (saved && uploaded && editing?.image_url) {
      const oldPath = serviceImagePathFromUrl(editing.image_url);
      if (oldPath && oldPath !== uploaded.path) {
        try { await removeUploadedServiceImage(oldPath); }
        catch { setNotice("Service updated, but the previous image could not be removed from Storage."); }
      }
    }
  };

  const toggleAvailability = async (service: Service) => {
    setSaving(true); setError("");
    try {
      const updated = await saveService({ name: service.name, slug: service.slug, short_description: service.short_description, description: service.description, image_url: service.image_url, available: !service.available }, service.id);
      setServices((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(updated.available ? "Service is now available publicly." : "Service is now hidden publicly.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update service status."); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!confirmDelete || saving) return;
    setSaving(true); setError("");
    try {
      await deleteService(confirmDelete.id);
      const oldPath = serviceImagePathFromUrl(confirmDelete.image_url);
      if (oldPath) { try { await removeUploadedServiceImage(oldPath); } catch { setNotice("Service deleted; its old image could not be removed from Storage."); } }
      setServices((current) => current.filter((item) => item.id !== confirmDelete.id));
      setConfirmDelete(null); setNotice("Service deleted successfully.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete service."); }
    finally { setSaving(false); }
  };

  return <AdminShell title="Services"><section className="ad-services-page">
    <header className="ad-page-header"><div><h1>Services Management</h1><p>Manage service information and images displayed on the public website.</p></div><button type="button" className="ad-btn ad-btn-primary" onClick={startAdd}>+ Add Service</button></header>
    {error && <div className="ad-content-alert error" role="alert">{error}</div>}
    {notice && <div className="ad-content-alert success" role="status">{notice}</div>}
    <div className="ad-card ad-managed-list">
      <div className="ad-card-header"><span className="ad-card-title">Services</span><span>{services.length} total</span></div>
      <div className="ad-services-search"><input className="ad-input" type="search" placeholder="Search services" aria-label="Search services" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      {loading ? <div className="ad-empty" role="status">Loading services…</div>
        : visible.length === 0 ? <div className="ad-empty"><h3>{services.length ? "No matching services" : "No services yet"}</h3><p>{services.length ? "Try a different search." : "Add a service to get started."}</p></div>
        : <div className="ad-services-grid">{visible.map((service) => <article className="ad-service-admin-card" key={service.id}>
          <div className="ad-service-admin-image"><Stethoscope className="ad-service-medical-fallback" aria-hidden="true" /><img src={service.image_url || "/images/services/medical-placeholder.svg"} alt={service.name} onError={(event) => { event.currentTarget.style.display = "none"; }} /><span className={`ad-badge ${service.available ? "ad-badge-green" : "ad-badge-gray"}`}>{service.available ? "Available" : "Hidden"}</span></div>
          <div className="ad-service-admin-body"><div className="ad-service-admin-eyebrow">{service.slug}</div><h2>{service.name}</h2><p>{service.short_description || service.description}</p>
            <div className="ad-managed-actions"><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => setPreview(service)}>View</button><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => startEdit(service)}>Edit</button><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" disabled={saving} onClick={() => void toggleAvailability(service)}>{service.available ? "Hide" : "Make Available"}</button><button type="button" className="ad-btn ad-btn-danger ad-btn-sm" onClick={() => setConfirmDelete(service)}>Delete</button></div>
          </div>
        </article>)}</div>}
    </div>

    {formOpen && <Dialog className="ad-service-form-modal" title={editing ? "Edit Service" : "Add Service"} close={closeForm}>
      <form className="ad-form ad-managed-form" onSubmit={(event) => void submit(event)}>
        <div className="ad-form-grid">
          <Field label="Service Name"><input className="ad-input" value={form.name} onChange={(event) => { setField("name", event.target.value); if (!editing && !form.slug) setField("slug", slugifyContent(event.target.value)); }} required /></Field>
          <Field label="Slug"><input className="ad-input" value={form.slug} onChange={(event) => setField("slug", slugifyContent(event.target.value))} required /></Field>
          <Field label="Status"><select className="ad-select" value={form.available ? "available" : "hidden"} onChange={(event) => setField("available", event.target.value === "available")}><option value="available">Available</option><option value="hidden">Hidden</option></select></Field>
          <div className="ad-form-row"><span className="ad-label">Service Image</span><div className="ad-service-image-preview"><Stethoscope className="ad-service-image-fallback-icon" aria-hidden="true" /><img src={previewUrl || form.image_url || "/images/services/medical-placeholder.svg"} alt="Service preview" onError={(event) => { event.currentTarget.style.display = "none"; }} /></div><input ref={fileInput} className="ad-product-file-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { selectImage(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} aria-label="Choose service image" /><div className="ad-managed-actions"><button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={() => fileInput.current?.click()}>{file || form.image_url ? "Replace Image" : "Choose Image"}</button><small>JPG, PNG, or WebP · maximum 5 MB</small></div>{uploading && <span className="ad-product-uploading" role="status"><span className="ad-upload-spinner" />Uploading image…</span>}</div>
        </div>
        <Field label="Short Description"><textarea className="ad-textarea" rows={2} maxLength={240} value={form.short_description} onChange={(event) => setField("short_description", event.target.value)} required /></Field>
        <Field label="Full Description"><textarea className="ad-textarea" rows={5} value={form.description} onChange={(event) => setField("description", event.target.value)} required /></Field>
        <div className="ad-managed-actions"><button className="ad-btn ad-btn-primary" disabled={saving}>{saving ? uploading ? "Uploading image…" : "Saving…" : editing ? "Save Changes" : "Add Service"}</button><button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={closeForm}>Cancel</button></div>
      </form>
    </Dialog>}
    {preview && <Dialog title="Service preview" close={() => setPreview(null)}><article className="managed-preview"><img className="ad-service-preview-image" src={preview.image_url || "/images/services/medical-placeholder.svg"} alt={preview.name} /><h2>{preview.name}</h2><p>{preview.short_description}</p><p>{preview.description}</p></article></Dialog>}
    {confirmDelete && <Dialog title="Delete service?" close={() => !saving && setConfirmDelete(null)}><p>Delete <strong>{confirmDelete.name}</strong>? This cannot be undone.</p><div className="ad-managed-actions"><button type="button" className="ad-btn ad-btn-ghost" disabled={saving} onClick={() => setConfirmDelete(null)}>Cancel</button><button type="button" className="ad-btn ad-btn-danger" disabled={saving} onClick={() => void remove()}>{saving ? "Deleting…" : "Delete service"}</button></div></Dialog>}
  </section></AdminShell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="ad-form-row"><span className="ad-label">{label}</span>{children}</label>; }
function Dialog({ title, children, close, className = "" }: { title: string; children: React.ReactNode; close: () => void; className?: string }) { return <div className="ad-modal-backdrop" onClick={close}><div className={`ad-modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}><div className="ad-modal-header"><strong className="ad-modal-title">{title}</strong><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={close}>Close</button></div><div className="ad-modal-body">{children}</div></div></div>; }
