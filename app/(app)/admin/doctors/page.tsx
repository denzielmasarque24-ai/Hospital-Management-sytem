"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { deleteDoctor, listDoctors, removeDoctorPhoto, saveDoctor, uploadDoctorPhoto, validateDoctorPhoto, type Doctor, type DoctorInput } from "@/lib/admin/doctors";

const EMPTY: DoctorInput = { first_name: "", last_name: "", specialization: "", license_number: "", email: "", phone: "", address: "", availability_schedule: "", experience: "", status: "active", photo_url: null };
const PAGE_SIZE = 8;

export default function DoctorsPage() {
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);

  const refresh = async () => { setError(""); try { setDoctors(await listDoctors()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load doctors."); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (!photo) { setPhotoPreview(""); return; } const url = URL.createObjectURL(photo); setPhotoPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);
  const specialties = useMemo(() => ["All", ...Array.from(new Set(doctors.map((d) => d.specialization).filter(Boolean))).sort()], [doctors]);
  const filtered = useMemo(() => { const search = query.trim().toLowerCase(); return doctors.filter((d) => (specialty === "All" || d.specialization === specialty) && (!search || [d.first_name, d.last_name, d.specialization, d.license_number, d.email, d.phone].some((v) => v.toLowerCase().includes(search)))); }, [doctors, query, specialty]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const update = (key: keyof DoctorInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const openAdd = () => { setSelected(null); setForm(EMPTY); setPhoto(null); setError(""); setModal("add"); };
  const openEdit = (doctor: Doctor) => { setSelected(doctor); const { id: _id, created_at: _created, updated_at: _updated, ...values } = doctor; setForm(values); setPhoto(null); setError(""); setModal("edit"); };
  const close = () => { if (busy) return; setModal(null); setPhoto(null); };
  const choosePhoto = (file?: File) => { if (!file) return; const validation = validateDoctorPhoto(file); if (validation) { setPhoto(null); setError(validation); if (photoRef.current) photoRef.current.value = ""; return; } setError(""); setPhoto(file); };
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    const required = [form.first_name, form.last_name, form.specialization, form.license_number, form.email, form.phone, form.address, form.availability_schedule];
    if (required.some((value) => !value.trim())) { setError("Complete all required doctor fields."); return; }
    if (!validEmail.test(form.email.trim())) { setError("Enter a valid email address."); return; }
    setBusy(true); setError(""); let uploaded: Awaited<ReturnType<typeof uploadDoctorPhoto>> | null = null;
    try {
      let data = { ...form, first_name: form.first_name.trim(), last_name: form.last_name.trim(), specialization: form.specialization.trim(), license_number: form.license_number.trim(), email: form.email.trim(), phone: form.phone.trim(), address: form.address.trim(), availability_schedule: form.availability_schedule.trim(), experience: form.experience.trim() };
      if (photo) { uploaded = await uploadDoctorPhoto(photo); data = { ...data, photo_url: uploaded.publicUrl }; }
      const saved = await saveDoctor(data, modal === "edit" ? selected?.id : undefined);
      setDoctors((items) => modal === "edit" ? items.map((item) => item.id === saved.id ? saved : item) : [...items, saved].sort((a, b) => a.last_name.localeCompare(b.last_name)));
      setModal(null); setPhoto(null); setNotice(modal === "edit" ? "Doctor updated." : "Doctor added.");
    } catch (reason) {
      if (uploaded) { try { await removeDoctorPhoto(uploaded.path); } catch { /* retain original error */ } }
      setError(reason instanceof Error ? reason.message : "Could not save doctor.");
    } finally { setBusy(false); }
  };
  const remove = async () => { if (!selected || busy) return; setBusy(true); setError(""); try { await deleteDoctor(selected.id); setDoctors((items) => items.filter((item) => item.id !== selected.id)); setModal(null); setNotice("Doctor deleted."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete doctor."); } finally { setBusy(false); } };
  const statusToggle = async (doctor: Doctor) => { setBusy(true); try { const { id, created_at: _created, updated_at: _updated, ...values } = doctor; const saved = await saveDoctor({ ...values, status: doctor.status === "active" ? "inactive" : "active" }, id); setDoctors((items) => items.map((item) => item.id === saved.id ? saved : item)); setNotice(`Dr. ${saved.first_name} ${saved.last_name} is ${saved.status}.`); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update doctor status."); } finally { setBusy(false); } };

  return <AdminShell title="Doctors"><section>
    <header className="ad-page-header"><div><h1>Doctors Management</h1><p>Manage doctor profiles and availability.</p></div><button className="ad-btn ad-btn-primary" onClick={openAdd}>+ Add Doctor</button></header>
    {error && <div className="ad-content-alert error" role="alert">{error}</div>}{notice && <div className="ad-content-alert success" role="status">{notice}</div>}
    <div className="ad-card"><div className="ad-doctors-toolbar"><input className="ad-input" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search name, specialty, license, or contact" aria-label="Search doctors"/><select className="ad-select" value={specialty} onChange={(e) => { setSpecialty(e.target.value); setPage(1); }} aria-label="Filter by specialization">{specialties.map((item) => <option key={item}>{item}</option>)}</select></div>
      {loading ? <div className="ad-empty" role="status">Loading doctors…</div> : doctors.length === 0 ? <div className="ad-empty"><h3>No doctors found</h3><p>Add a doctor profile to get started.</p></div> : filtered.length === 0 ? <div className="ad-empty"><h3>No matching doctors</h3><p>Change the search or specialization filter.</p></div> : <><div className="ad-table-wrap"><table className="ad-table ad-doctors-table"><thead><tr><th>Doctor</th><th>Specialization</th><th>License</th><th>Email / Phone</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((doctor) => <tr key={doctor.id}><td><div className="ad-doctor-person">{doctor.photo_url ? <img src={doctor.photo_url} alt=""/> : <span className="ad-doctor-avatar">{doctor.first_name[0]}{doctor.last_name[0]}</span>}<strong>Dr. {doctor.first_name} {doctor.last_name}</strong></div></td><td>{doctor.specialization}</td><td>{doctor.license_number}</td><td><span>{doctor.email}</span><small className="ad-table-subtext">{doctor.phone}</small></td><td><span className={`ad-badge ${doctor.status === "active" ? "ad-badge-green" : "ad-badge-gray"}`}>{doctor.status}</span></td><td><div className="ad-managed-actions"><button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => { setSelected(doctor); setModal("view"); }}>View</button><button className="ad-btn ad-btn-ghost ad-btn-sm" onClick={() => openEdit(doctor)}>Edit</button><button className="ad-btn ad-btn-ghost ad-btn-sm" disabled={busy} onClick={() => void statusToggle(doctor)}>{doctor.status === "active" ? "Deactivate" : "Activate"}</button><button className="ad-btn ad-btn-danger ad-btn-sm" onClick={() => { setSelected(doctor); setModal("delete"); }}>Delete</button></div></td></tr>)}</tbody></table></div><div className="ad-doctors-pagination"><span>{filtered.length} doctors · Page {page} of {pageCount}</span><div><button className="ad-btn ad-btn-ghost ad-btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button><button className="ad-btn ad-btn-ghost ad-btn-sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</button></div></div></>}
    </div>
    {(modal === "add" || modal === "edit") && <Dialog title={modal === "add" ? "Add Doctor" : "Edit Doctor"} close={close}><form className="ad-form" onSubmit={(e) => void save(e)}>
      <div className="ad-doctor-photo-upload"><span className="ad-label">Profile photo</span><div className="ad-doctor-photo-preview">{photoPreview || form.photo_url ? <img src={photoPreview || form.photo_url || ""} alt="Doctor profile preview"/> : <span>Photo preview</span>}</div><input ref={photoRef} className="ad-product-file-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(e) => { choosePhoto(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }}/><button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={() => photoRef.current?.click()}>{photo || form.photo_url ? "Replace Photo" : "Upload Photo"}</button><small>JPG, PNG, or WebP · maximum 5 MB</small></div>
      <div className="ad-form-grid"><Field label="First name"><input className="ad-input" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} required/></Field><Field label="Last name"><input className="ad-input" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} required/></Field><Field label="Specialization"><input className="ad-input" value={form.specialization} onChange={(e) => update("specialization", e.target.value)} required/></Field><Field label="License number"><input className="ad-input" value={form.license_number} onChange={(e) => update("license_number", e.target.value)} required/></Field><Field label="Email"><input className="ad-input" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required/></Field><Field label="Phone number"><input className="ad-input" type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} required/></Field><Field label="Status"><select className="ad-select" value={form.status} onChange={(e) => update("status", e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field><Field label="Address"><input className="ad-input" value={form.address} onChange={(e) => update("address", e.target.value)} required/></Field></div>
      <Field label="Experience"><input className="ad-input" value={form.experience} onChange={(e) => update("experience", e.target.value)} placeholder="e.g. 8 years" /></Field><Field label="Availability schedule"><textarea className="ad-textarea" rows={3} value={form.availability_schedule} onChange={(e) => update("availability_schedule", e.target.value)} placeholder="e.g. Monday–Friday, 9:00 AM–5:00 PM" required/></Field><div className="ad-managed-actions"><button className="ad-btn ad-btn-primary" disabled={busy}>{busy ? photo ? "Uploading and saving…" : "Saving…" : modal === "add" ? "Add Doctor" : "Save Changes"}</button><button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={close}>Cancel</button></div>
    </form></Dialog>}
    {modal === "view" && selected && <Dialog title="Doctor Profile" close={close}><div className="ad-doctor-profile-view">{selected.photo_url && <img src={selected.photo_url} alt={`Dr. ${selected.first_name} ${selected.last_name}`}/>}<h2>Dr. {selected.first_name} {selected.last_name}</h2><p>{selected.specialization}</p></div>{[["License Number", selected.license_number], ["Email", selected.email], ["Phone", selected.phone], ["Address", selected.address], ["Availability", selected.availability_schedule], ["Status", selected.status]].map(([label, value]) => <div className="ad-product-detail-row" key={label}><b>{label}</b><span>{value}</span></div>)}</Dialog>}
    {modal === "delete" && selected && <Dialog title="Delete doctor?" close={close}><p>Delete <strong>Dr. {selected.first_name} {selected.last_name}</strong>? This cannot be undone.</p><div className="ad-managed-actions"><button className="ad-btn ad-btn-ghost" disabled={busy} onClick={close}>Cancel</button><button className="ad-btn ad-btn-danger" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete Doctor"}</button></div></Dialog>}
  </section></AdminShell>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="ad-form-row"><span className="ad-label">{label}</span>{children}</label>; }
function Dialog({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) { return <div className="ad-modal-backdrop" onClick={close}><div className="ad-modal ad-doctor-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}><div className="ad-modal-header"><strong className="ad-modal-title">{title}</strong><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={close}>Close</button></div><div className="ad-modal-body">{children}</div></div></div>; }
