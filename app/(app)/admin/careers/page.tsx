"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, BriefcaseBusiness, Clock3, Eye, FileText, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { deleteCareer, listCareers, saveCareer, type Career, type CareerInput } from "@/lib/admin/managed-content";

const blank: CareerInput = { title: "", department: "", location: "", employment_type: "Full-time", description: "" };
type CareerStatus = "Published" | "Draft" | "Closed";
type SortKey = "title" | "department" | "location" | "employment_type" | "status";
function statusOf(job: Career): CareerStatus {
  const status = String(job.status ?? "").toLowerCase();
  if (status === "closed") return "Closed";
  if (["published", "active", "open"].includes(status)) return "Published";
  if (status === "draft") return "Draft";
  return job.is_published !== false ? "Published" : "Draft";
}

export default function CareersManagementPage() {
  const [rows, setRows] = useState<Career[]>([]);
  const [form, setForm] = useState<CareerInput>(blank);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<string | undefined>();
  const [preview, setPreview] = useState<Career | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Career | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All departments");
  const [typeFilter, setTypeFilter] = useState("All types");
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortAscending, setSortAscending] = useState(true);

  const refresh = async () => { setLoading(true); setError(""); try { setRows(await listCareers()); } catch (e) { setError(e instanceof Error ? e.message : "Could not load career listings."); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, []);
  const update = (key: keyof CareerInput, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const startAdd = () => { setEditing(undefined); setForm(blank); setError(""); setFormOpen(true); };
  const startEdit = (job: Career) => { setForm({ title: job.title, department: job.department, location: job.location, employment_type: job.employment_type, description: job.description }); setEditing(job.id); setNotice(""); setFormOpen(true); };
  const cancelEdit = () => { if (busy) return; setFormOpen(false); setEditing(undefined); setForm(blank); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!form.title.trim() || !form.department.trim() || !form.location.trim() || !form.description.trim()) { setError("Title, department, location, and description are required."); return; }
    setBusy(true); setError("");
    try { await saveCareer({ title: form.title.trim(), department: form.department.trim(), location: form.location.trim(), employment_type: form.employment_type.trim(), description: form.description.trim() }, editing); setFormOpen(false); setEditing(undefined); setForm(blank); setNotice("Career listing saved."); await refresh(); }
    catch (e) { console.error("Career save failed:", e); const message = typeof e === "object" && e !== null && "message" in e ? String(e.message) : "Could not save career listing."; setError(message); }
    finally { setBusy(false); }
  };
  const remove = async () => { if (!confirmDelete || busy) return; setBusy(true); setError(""); try { await deleteCareer(confirmDelete.id); setConfirmDelete(null); setRows((current) => current.filter((job) => job.id !== confirmDelete.id)); setNotice("Career listing deleted."); } catch (e) { setError(e instanceof Error ? e.message : "Could not delete career listing."); } finally { setBusy(false); } };
  const counts = useMemo(() => ({
    total: rows.length,
    fullTime: rows.filter((job) => job.employment_type.toLowerCase() === "full-time").length,
    partTime: rows.filter((job) => job.employment_type.toLowerCase() === "part-time").length,
    contract: rows.filter((job) => job.employment_type.toLowerCase() === "contract").length,
  }), [rows]);
  const departments = useMemo(() => Array.from(new Set(rows.map((job) => job.department).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [rows]);
  const employmentTypes = useMemo(() => Array.from(new Set(rows.map((job) => job.employment_type).filter(Boolean))).sort((a, b) => a.localeCompare(b)), [rows]);
  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return rows.filter((job) => {
      const matchesSearch = !normalized || [job.title, job.department, job.location, job.employment_type, job.description].some((value) => value.toLowerCase().includes(normalized));
      return matchesSearch && (departmentFilter === "All departments" || job.department === departmentFilter) && (typeFilter === "All types" || job.employment_type === typeFilter);
    }).sort((a, b) => {
      const first = sortKey === "status" ? statusOf(a) : a[sortKey];
      const second = sortKey === "status" ? statusOf(b) : b[sortKey];
      return first.localeCompare(second) * (sortAscending ? 1 : -1);
    });
  }, [rows, search, departmentFilter, typeFilter, sortKey, sortAscending]);
  const sortBy = (key: SortKey) => { if (sortKey === key) setSortAscending((value) => !value); else { setSortKey(key); setSortAscending(true); } };
  const sortHeading = (label: string, key: SortKey) => <button type="button" className="career-sort-button" onClick={() => sortBy(key)} aria-label={`Sort by ${label}`} aria-pressed={sortKey === key}>{label}<ArrowDownUp size={12} className={sortKey === key ? "active" : ""}/></button>;

  return <AdminShell title="Careers"><section className="ad-careers-page">
    <header className="ad-page-header"><div><h1>Careers Management</h1><p>Review and manage existing job opportunities.</p></div><div className="ad-careers-header-actions"><button type="button" className="ad-btn ad-btn-ghost" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? "ad-spin" : ""} />{loading ? "Loading…" : "Refresh"}</button><button type="button" className="ad-btn ad-btn-primary" onClick={startAdd}><Plus size={17} /> Add Job</button></div></header>
    {error && <div className="ad-content-alert error" role="alert">{error}</div>}{notice && <div className="ad-content-alert success" role="status">{notice}</div>}
    <div className="ad-career-stats" aria-label="Job listing statistics">
      <Stat icon={<BriefcaseBusiness size={18} />} label="Total Jobs" value={counts.total} tone="blue" />
      <Stat icon={<Clock3 size={18} />} label="Full-time" value={counts.fullTime} tone="teal" />
      <Stat icon={<Clock3 size={18} />} label="Part-time" value={counts.partTime} tone="purple" />
      <Stat icon={<FileText size={18} />} label="Contract" value={counts.contract} tone="amber" />
    </div>
    <div className="ad-card ad-managed-list ad-careers-list"><div className="ad-card-header"><span className="ad-card-title">Job Listings</span><span>{filteredRows.length}{filteredRows.length !== rows.length ? ` of ${rows.length}` : ""} total</span></div>
      {!loading && rows.length > 0 && <div className="ad-careers-toolbar"><label className="ad-career-search"><Search size={15}/><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, department, location" aria-label="Search job listings"/></label><select className="ad-select" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} aria-label="Filter by department"><option>All departments</option>{departments.map((department) => <option key={department}>{department}</option>)}</select><select className="ad-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filter by employment type"><option>All types</option>{employmentTypes.map((type) => <option key={type}>{type}</option>)}</select></div>}
      {loading ? <div className="ad-empty" role="status">Loading career listings…</div> : error && rows.length === 0 ? <div className="ad-empty"><h3>Could not load career listings</h3><p>Check the error above, then refresh to retry.</p><button type="button" className="ad-btn ad-btn-ghost" onClick={() => void refresh()}>Retry</button></div> : rows.length === 0 ? <div className="ad-empty"><h3>No career listings found</h3><p>No records were returned from public.careers.</p></div> : filteredRows.length === 0 ? <div className="ad-empty"><h3>No matching jobs</h3><p>Adjust the search or filters.</p></div> : <div className="ad-careers-table-wrap"><table className="ad-table ad-careers-table"><colgroup><col className="career-col-title"/><col className="career-col-department"/><col className="career-col-location"/><col className="career-col-type"/><col className="career-col-status"/><col className="career-col-actions"/></colgroup><thead><tr><th scope="col">{sortHeading("Job Title", "title")}</th><th scope="col">{sortHeading("Department", "department")}</th><th scope="col">{sortHeading("Location", "location")}</th><th scope="col">{sortHeading("Type", "employment_type")}</th><th scope="col">{sortHeading("Status", "status")}</th><th scope="col">Actions</th></tr></thead><tbody>{filteredRows.map((job) => { const status = statusOf(job); return <tr key={job.id}><td className="career-title-cell"><span title={job.title}>{job.title}</span></td><td className="career-ellipsis" title={job.department}>{job.department}</td><td className="career-ellipsis" title={job.location}>{job.location}</td><td><span className="career-type-pill" title={job.employment_type}>{job.employment_type}</span></td><td><span className={`career-status career-status-${status.toLowerCase()}`}><i/>{status}</span></td><td><div className="career-icon-actions"><button type="button" title="View job details" aria-label={`View ${job.title}`} onClick={() => setPreview(job)}><Eye size={16}/></button><button type="button" title="Edit job" aria-label={`Edit ${job.title}`} onClick={() => startEdit(job)}><Pencil size={15}/></button><button type="button" className="career-delete-action" title="Delete job" aria-label={`Delete ${job.title}`} onClick={() => setConfirmDelete(job)}><Trash2 size={16}/></button></div></td></tr>; })}</tbody></table></div>}
    </div>

    {formOpen && <Dialog title={editing ? "Edit career listing" : "Add a career listing"} close={cancelEdit}><form className="ad-form ad-managed-form" onSubmit={(event) => void submit(event)}><div className="ad-form-grid">
      <Field label="Job title"><input className="ad-input" value={form.title} onChange={(e) => update("title", e.target.value)} required /></Field>
      <Field label="Department"><input className="ad-input" value={form.department} onChange={(e) => update("department", e.target.value)} required /></Field>
      <Field label="Location"><input className="ad-input" value={form.location} onChange={(e) => update("location", e.target.value)} required /></Field>
      <Field label="Employment type"><select className="ad-select" value={form.employment_type} onChange={(e) => update("employment_type", e.target.value)}>{["Full-time", "Part-time", "Contract", "Temporary", "Internship"].map((v) => <option key={v}>{v}</option>)}</select></Field>
    </div><Field label="Job description"><textarea className="ad-textarea" rows={5} value={form.description} onChange={(e) => update("description", e.target.value)} required /></Field><div className="ad-managed-actions"><button className="ad-btn ad-btn-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save Changes" : "Add Job"}</button><button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={cancelEdit}>Cancel</button></div></form></Dialog>}
    {preview && <Dialog title="Job details" close={() => setPreview(null)}><article className="managed-preview"><span>{preview.department} · {preview.location} · {preview.employment_type}</span><h2>{preview.title}</h2><span className={`career-status career-status-${statusOf(preview).toLowerCase()}`}><i/>{statusOf(preview)}</span><h3>Job description</h3><p>{preview.description}</p></article></Dialog>}
    {confirmDelete && <Dialog title="Delete listing?" close={() => !busy && setConfirmDelete(null)}><p>Delete <strong>{confirmDelete.title}</strong>? This cannot be undone.</p><div className="ad-managed-actions"><button type="button" className="ad-btn ad-btn-ghost" disabled={busy} onClick={() => setConfirmDelete(null)}>Cancel</button><button type="button" className="ad-btn ad-btn-danger" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete listing"}</button></div></Dialog>}
  </section></AdminShell>;
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) { return <div className="ad-career-stat"><span className={`ad-career-stat-icon ${tone}`}>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="ad-form-row"><span className="ad-label">{label}</span>{children}</label>; }
function Dialog({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) { return <div className="ad-modal-backdrop" onClick={close}><div className="ad-modal ad-career-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}><div className="ad-modal-header"><strong className="ad-modal-title">{title}</strong><button type="button" className="ad-btn ad-btn-ghost ad-btn-sm" onClick={close}>Close</button></div><div className="ad-modal-body">{children}</div></div></div>; }
