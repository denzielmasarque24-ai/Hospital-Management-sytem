"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { deleteDoctor, listDoctors, removeDoctorPhoto, saveDoctor, uploadDoctorPhoto, validateDoctorPhoto, type Doctor, type DoctorInput } from "@/lib/admin/doctors";

const EMPTY: DoctorInput = { display_name: "", specialty: "", license_number: null, email: null, phone: null, bio: null, experience_years: null, available: false, image_url: null, avatar_url: null };
const PAGE_SIZE = 8;
function errorMessage(reason: unknown) {
  if (!reason || typeof reason !== "object") return "The doctor request failed. Please retry.";
  const error = reason as {message?: string; code?: string; status?: number};
  if (error.code === "RECORD_NOT_FOUND") return error.message || "Record not found.";
  if (error.code === "42501" || error.status === 403) return "Access denied. Your account does not have permission to manage doctor records.";
  if (error.code === "PGRST116") return "Unable to save the doctor record because the database did not return exactly one row. Check the record and database permissions, then retry.";
  const details = [error.code, error.status ? `HTTP ${error.status}` : null].filter(Boolean).join(" / ");
  return `${error.message || "The doctor request failed."}${details ? ` (${details})` : ""}`;
}
function asInput(doctor: Doctor): DoctorInput {
  return { display_name: doctor.display_name, specialty: doctor.specialty, license_number: doctor.license_number, email: doctor.email, phone: doctor.phone, bio: doctor.bio, experience_years: doctor.experience_years, available: doctor.available, image_url: doctor.image_url, avatar_url: doctor.avatar_url };
}
function availability(value: boolean | null) { return value === true ? "Available" : value === false ? "Unavailable" : "Not recorded"; }

function DoctorsManagement() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("All");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"add" | "edit" | "view" | "delete" | null>(null);
  const [selected, setSelected] = useState<Doctor | null>(null);
  const [form, setForm] = useState<DoctorInput>(EMPTY);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setLoadError("");
    try { setDoctors(await listDoctors()); }
    catch (reason) { setLoadError(errorMessage(reason)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!photo) { setPhotoPreview(""); return; }
    const url = URL.createObjectURL(photo); setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const specialties = useMemo(() => ["All", ...Array.from(new Set(doctors.map(d => d.specialty).filter(Boolean))).sort()], [doctors]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return doctors.filter(d => (specialty === "All" || d.specialty === specialty) && (!search || [d.display_name, d.specialty, d.license_number, d.email, d.phone].some(value => value?.toLowerCase().includes(search))));
  }, [doctors, query, specialty]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { setPage(current => Math.min(current, pageCount)); }, [pageCount]);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const update = <K extends keyof DoctorInput>(key: K, value: DoctorInput[K]) => setForm(current => ({ ...current, [key]: value }));
  const openAdd = () => { setSelected(null); setForm(EMPTY); setPhoto(null); setError(""); setModal("add"); };
  const openEdit = (doctor: Doctor) => { setSelected(doctor); setForm(asInput(doctor)); setPhoto(null); setError(""); setModal("edit"); };
  const close = () => { if (!busy) { setModal(null); setPhoto(null); setError(""); } };
  const choosePhoto = (file?: File) => {
    if (!file) return;
    const validation = validateDoctorPhoto(file);
    if (validation) { setError(validation); return; }
    setError(""); setPhoto(file);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    if (!form.display_name.trim() || !form.specialty.trim()) { setError("Enter the doctor's name and specialty."); return; }
    if (form.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError("Enter a valid email address, or leave it blank."); return; }
    if (form.experience_years !== null && (!Number.isSafeInteger(form.experience_years) || form.experience_years < 0)) { setError("Enter a valid whole number of years, or leave experience blank."); return; }
    if (modal === "edit" && !selected?.id) { setError("Select a doctor record before editing."); return; }
    setBusy(true); setError("");
    let uploaded: Awaited<ReturnType<typeof uploadDoctorPhoto>> | null = null;
    try {
      let input = { ...form };
      if (photo) { uploaded = await uploadDoctorPhoto(photo); input = { ...input, image_url: uploaded.publicUrl, avatar_url: uploaded.publicUrl }; }
      const saved = await saveDoctor(input, modal === "edit" ? selected!.id : undefined);
      setDoctors(items => (modal === "edit" ? items.map(item => item.id === saved.id ? saved : item) : [...items, saved]).sort((a, b) => a.display_name.localeCompare(b.display_name)));
      setModal(null); setPhoto(null); setNotice(modal === "edit" ? "Doctor updated." : "Doctor added.");
    } catch (reason) {
      if (uploaded) { try { await removeDoctorPhoto(uploaded.path); } catch { /* Preserve the save error. */ } }
      setError(errorMessage(reason));
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try { await deleteDoctor(selected.id); setDoctors(items => items.filter(item => item.id !== selected.id)); setModal(null); setNotice("Doctor deleted."); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };
  const toggle = async (doctor: Doctor) => {
    if (busy) return;
    setBusy(true); setError("");
    try { const saved = await saveDoctor({ ...asInput(doctor), available: doctor.available !== true }, doctor.id); setDoctors(items => items.map(item => item.id === saved.id ? saved : item)); setNotice(`${saved.display_name}: ${availability(saved.available)}.`); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };

  return <section>
    <header className="ad-page-header"><div><h1>Doctors Management</h1><p>Manage existing doctor profiles and recorded availability.</p></div><div className="ad-managed-actions"><button className="ad-btn ad-btn-ghost" disabled={loading || busy} onClick={() => void refresh()}>Refresh</button><button className="ad-btn ad-btn-primary" onClick={openAdd}>+ Add Doctor</button></div></header>
    {error && !modal && <div className="ad-content-alert error" role="alert">{error}</div>}
    {notice && <div className="ad-content-alert success" role="status">{notice}</div>}
    <div className="ad-card">
      <div className="ad-doctors-toolbar"><input className="ad-input" type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search name, specialty, license, or contact" aria-label="Search doctors"/><select className="ad-select" value={specialty} onChange={e => { setSpecialty(e.target.value); setPage(1); }} aria-label="Filter by specialty">{specialties.map(item => <option key={item}>{item}</option>)}</select></div>
      {loading ? <div className="ad-empty" role="status">Loading doctors...</div>
        : loadError ? <div className="ad-empty" role="alert"><h3>Could not load doctors</h3><p>{loadError}</p><button className="ad-btn ad-btn-primary" onClick={() => void refresh()}>Retry</button></div>
        : doctors.length === 0 ? <div className="ad-empty"><h3>No doctors found</h3><p>No doctor records are visible to this administrator. If records are expected, ask the administrator to review read permissions before adding a duplicate.</p></div>
        : filtered.length === 0 ? <div className="ad-empty"><h3>No matching doctors</h3><p>Change the search or specialty filter.</p></div>
        : <><div className="ad-table-wrap"><table className="ad-table ad-doctors-table"><thead><tr><th>Doctor</th><th>Specialty</th><th>License</th><th>Email / Phone</th><th>Availability</th><th>Actions</th></tr></thead><tbody>{visible.map(doctor => <tr key={doctor.id}>
          <td><div className="ad-doctor-person"><DoctorPortrait doctor={doctor}/><div><strong>{doctor.display_name || "Name not recorded"}</strong>{doctor.is_demo && <small className="ad-table-subtext">Sample profile</small>}</div></div></td><td>{doctor.specialty || "Not recorded"}</td><td>{doctor.license_number || "Not recorded"}</td><td>{doctor.email || "Not recorded"}<small className="ad-table-subtext">{doctor.phone || "Not recorded"}</small></td><td><span className={`ad-badge ${doctor.available === true ? "ad-badge-green" : "ad-badge-gray"}`}>{availability(doctor.available)}</span></td>
          <td><div className="ad-managed-actions"><button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => { setSelected(doctor); setError(""); setModal("view"); }}>View</button><button className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy} onClick={() => openEdit(doctor)}>Edit</button><button className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy} onClick={() => void toggle(doctor)}>{doctor.available === true ? "Mark unavailable" : "Mark available"}</button><button className="ad-btn ad-btn-danger ad-btn-sm" disabled={busy} onClick={() => { setSelected(doctor); setError(""); setModal("delete"); }}>Delete</button></div></td>
        </tr>)}</tbody></table></div><div className="ad-doctors-pagination"><span>{filtered.length} doctors / Page {page} of {pageCount}</span><div><button className="ad-btn ad-btn-ghost ad-btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button className="ad-btn ad-btn-ghost ad-btn-sm" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next</button></div></div></>}
    </div>
    {(modal === "add" || modal === "edit") && <Dialog title={modal === "add" ? "Add Doctor" : "Edit Doctor"} close={close}>
      {error && <p className="ad-content-alert error" role="alert">{error}</p>}
      <form className="ad-form" onSubmit={event => void save(event)}>
        <div className="ad-doctor-photo-upload"><span className="ad-label">Profile photo</span><div className="ad-doctor-photo-preview">{photoPreview || form.image_url || form.avatar_url ? <img src={photoPreview || form.image_url || form.avatar_url || ""} alt="Doctor profile preview"/> : <span>Photo not supplied</span>}</div><input ref={photoRef} className="ad-product-file-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={e => { choosePhoto(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }}/><button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={() => photoRef.current?.click()}>Upload / Replace Photo</button><small>JPG, PNG, or WebP / maximum 5 MB</small></div>
        <div className="ad-form-grid">
          <Field label="Doctor name"><input className="ad-input" value={form.display_name} onChange={e => update("display_name", e.target.value)} required/></Field>
          <Field label="Specialty"><input className="ad-input" value={form.specialty} onChange={e => update("specialty", e.target.value)} required/></Field>
          <Field label="License number (optional)"><input className="ad-input" value={form.license_number || ""} onChange={e => update("license_number", e.target.value)}/></Field>
          <Field label="Email (optional)"><input className="ad-input" type="email" value={form.email || ""} onChange={e => update("email", e.target.value)}/></Field>
          <Field label="Phone (optional)"><input className="ad-input" type="tel" value={form.phone || ""} onChange={e => update("phone", e.target.value)}/></Field>
          <Field label="Experience in years (optional)"><input className="ad-input" type="number" min="0" step="1" value={form.experience_years ?? ""} onChange={e => update("experience_years", e.target.value === "" ? null : Number(e.target.value))}/></Field>
          <Field label="Recorded availability"><select className="ad-select" value={form.available === null ? "" : String(form.available)} onChange={e => update("available", e.target.value === "" ? null : e.target.value === "true")}><option value="">Not recorded</option><option value="true">Available</option><option value="false">Unavailable</option></select></Field>
        </div>
        <Field label="Biography (optional)"><textarea className="ad-textarea" rows={4} value={form.bio || ""} onChange={e => update("bio", e.target.value)}/></Field>
        <div className="ad-managed-actions"><button className="ad-btn ad-btn-primary" disabled={busy}>{busy ? "Saving..." : modal === "add" ? "Add Doctor" : "Save Changes"}</button><button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={close}>Cancel</button></div>
      </form>
    </Dialog>}
    {modal === "view" && selected && <Dialog title="Doctor Profile" close={close}><div className="ad-doctor-profile-view"><DoctorPortrait doctor={selected}/><h2>{selected.display_name}</h2><p>{selected.specialty}</p></div>{[["License Number", selected.license_number], ["Email", selected.email], ["Phone", selected.phone], ["Experience", selected.experience_years === null ? null : `${selected.experience_years} years`], ["Availability", availability(selected.available)], ["Biography", selected.bio], ["Record ID", selected.id]].map(([label, value]) => <div className="ad-product-detail-row" key={label}><b>{label}</b><span>{value || "Not recorded"}</span></div>)}</Dialog>}
    {modal === "delete" && selected && <Dialog title="Delete doctor?" close={close}>{error && <p className="ad-content-alert error" role="alert">{error}</p>}<p>Delete <strong>{selected.display_name}</strong>? This cannot be undone. Existing appointments may prevent deletion.</p><div className="ad-managed-actions"><button className="ad-btn ad-btn-ghost" disabled={busy} onClick={close}>Cancel</button><button className="ad-btn ad-btn-danger" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting..." : "Delete Doctor"}</button></div></Dialog>}
  </section>;
}
export default function DoctorsPage() { return <AdminShell title="Doctors" adminOnly><DoctorsManagement/></AdminShell>; }
function DoctorPortrait({doctor}: {doctor: Doctor}) {
  const src = doctor.image_url || doctor.avatar_url;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? <img src={src} alt="" onError={() => setFailed(true)}/> : <span className="ad-doctor-avatar" aria-label="Photo not supplied">{doctor.display_name.replace(/^Dr\.?\s*/i, "").split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0,2) || "?"}</span>;
}
function Field({label, children}: {label: string; children: React.ReactNode}) { return <label className="ad-form-row"><span className="ad-label">{label}</span>{children}</label>; }
function Dialog({title, children, close}: {title: string; children: React.ReactNode; close: () => void}) { return <div className="ad-modal-backdrop" onClick={close}><div className="ad-modal ad-doctor-modal" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}><div className="ad-modal-header"><strong className="ad-modal-title">{title}</strong><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={close}>Close</button></div><div className="ad-modal-body">{children}</div></div></div>; }
