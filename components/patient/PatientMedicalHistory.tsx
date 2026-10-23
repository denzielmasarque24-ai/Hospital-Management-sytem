"use client";

import { useState } from "react";
import { ArrowDownWideNarrow, ArrowUpRight, CalendarDays, Check, ClipboardList, FileCheck2, FileText, FlaskConical, Search, ScanLine, SlidersHorizontal, Stethoscope, UserRound, X } from "lucide-react";
import { formatPatientDate, patientDateKey } from "@/lib/patient/dashboard.mjs";
import { supabase } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import "./medical-history.css";

export type HistoryItem = {
  id: string;
  kind: string;
  title: string;
  date: string;
  doctor: string;
  description: string;
  demo: boolean;
  resultAvailable: boolean;
  status: string;
  attachmentPath?: string | null;
  bookingStatus?: string | null;
};

const categories = [
  { label: "All History", kind: "all", icon: ClipboardList },
  { label: "Check-ups", kind: "checkup", icon: Stethoscope },
  { label: "Laboratory Tests", kind: "laboratory", icon: FlaskConical },
  { label: "Diagnostics", kind: "diagnostic", icon: ScanLine },
];
const categoryFor = (kind: string) => categories.find(category => category.kind === kind) || categories[1];
const statusLabel = (status: string) => String(status || "Recorded").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
const resultLabel = (item: HistoryItem) => !item.resultAvailable ? "No verified result available" : item.demo ? "Demo result record — fictional medical data" : "Verified result released by the care team";

export default function PatientMedicalHistory({ items }: { items: HistoryItem[] }) {
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [date, setDate] = useState("");
  const [reportError, setReportError] = useState("");
  const [openingReport, setOpeningReport] = useState(false);
  const [selected, setSelected] = useState<HistoryItem | null>(null);

  const openReport = async (item: HistoryItem) => {
    if (!supabase || !item.resultAvailable || item.demo || !item.attachmentPath || openingReport) return;
    setOpeningReport(true);
    setReportError("");
    try {
      const { data, error } = await supabase.storage.from("patient-lab-reports").createSignedUrl(item.attachmentPath, 60);
      if (error || !data?.signedUrl) throw new Error("Report unavailable");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      setReportError("The released report could not be opened. Please contact your care team.");
    } finally {
      setOpeningReport(false);
    }
  };

  const query = search.trim().toLocaleLowerCase("en-PH");
  const visible = items.filter(item =>
    (category === "all" || item.kind === category) &&
    (!date || patientDateKey(item.date) === date) &&
    (!query || [item.title, item.description, item.doctor, item.date, formatPatientDate(item.date), patientDateKey(item.date)].join(" ").toLocaleLowerCase("en-PH").includes(query))
  ).sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const filtered = category !== "all" || Boolean(search || date);
  const clearFilters = () => { setCategory("all"); setSearch(""); setDate(""); };

  return <section className="medical-history" aria-label="Medical history">
    <div className="mh-toolbar">
      <div className="mh-tabs" role="group" aria-label="Filter medical history">
        {categories.map(({ label, kind, icon: Icon }) => <button
          key={kind} type="button" className={`mh-tab${category === kind ? " is-active" : ""}`}
          aria-pressed={category === kind} onClick={() => setCategory(kind)}
        ><Icon size={16} aria-hidden="true"/><span>{label}</span><span className="mh-tab-count">{items.filter(item => kind === "all" || item.kind === kind).length}</span></button>)}
      </div>
      <div className="mh-search-controls">
        <label className="mh-search"><span className="patient-sr-only">Search medical history</span><Search size={17} aria-hidden="true"/><input type="search" placeholder="Search records, tests, or dates..." value={search} onChange={event => setSearch(event.target.value)}/></label>
        <label className={`mh-date${date ? " has-value" : ""}`}><CalendarDays size={16} aria-hidden="true"/><span className="patient-sr-only">Filter records by date</span><input aria-label="Filter records by date" type="date" value={date} onChange={event => setDate(event.target.value)}/></label>
      </div>
    </div>

    <div className="mh-timeline-heading"><div><h2>Your health timeline</h2><p role="status">Showing <strong>{visible.length}</strong> of {items.length} {items.length === 1 ? "record" : "records"}</p></div><div className="mh-timeline-actions">{filtered && <button type="button" className="mh-clear" onClick={clearFilters}><X size={14} aria-hidden="true"/>Clear filters</button>}<span className="mh-sort"><ArrowDownWideNarrow size={15} aria-hidden="true"/>Newest first</span></div></div>
    {reportError && <p className="patient-form-error" role="alert">{reportError}</p>}

    {!visible.length ? <div className="mh-empty">
      <span className="mh-empty-icon">{items.length ? <Search size={28}/> : <ClipboardList size={28}/>}</span>
      <h3>{items.length ? "No matching records" : "Your health history starts here"}</h3>
      <p>{items.length ? "Try a different search, date, or category to find the record you need." : "Medical records will appear here when shared by your MedWell care team."}</p>
      {filtered && <button type="button" className="patient-secondary-button" onClick={clearFilters}><SlidersHorizontal size={15}/>Clear filters</button>}
    </div> : <ol className="mh-timeline">
      {visible.map(item => {
        const categoryInfo = categoryFor(item.kind);
        const Icon = categoryInfo.icon;
        return <li className={`mh-timeline-item mh-kind-${item.kind}`} key={item.id}>
          <div className="mh-date-column"><time dateTime={patientDateKey(item.date) || undefined}>{formatPatientDate(item.date)}</time><span>{categoryInfo.label}</span></div>
          <span className="mh-timeline-dot" aria-hidden="true"><span/></span>
          <article className="mh-record" aria-labelledby={`mh-title-${item.id}`}>
            <div className="mh-record-information">
              <div className="mh-record-heading"><span className="mh-category-icon"><Icon size={26} aria-hidden="true"/></span><div className="mh-record-title"><p>{categoryInfo.label}</p><h3 id={`mh-title-${item.id}`}>{item.title}</h3></div></div>
              <div className="mh-record-meta"><span><UserRound size={14} aria-hidden="true"/>{item.doctor}</span></div>
              <p className="mh-description">{item.description}</p>
            </div>
            <div className="mh-record-status">
              <div className="mh-badges">{item.demo && <span className="patient-demo-badge">DEMO DATA</span>}<span className={`mh-status mh-status-${item.status.toLowerCase().replaceAll("_", "-")}`}>{item.status.toLowerCase() === "completed" && <Check size={12} aria-hidden="true"/>}{statusLabel(item.status)}</span></div>
              <div className="mh-result"><span className="mh-result-icon">{item.resultAvailable ? <FileCheck2 size={20} aria-hidden="true"/> : <FileText size={20} aria-hidden="true"/>}</span><div><span>Result Status</span><p>{resultLabel(item)}</p></div></div>
            </div>
            <button type="button" className="mh-record-action" onClick={() => {setReportError("");setSelected(item);}} aria-haspopup="dialog">View Details<ArrowUpRight size={15} aria-hidden="true"/></button>
          </article>
        </li>;
      })}
    </ol>}
    <Modal open={selected !== null} onClose={() => setSelected(null)}>
      {selected && <div className={`mh-record-dialog mh-kind-${selected.kind}`}>
        <header className="mh-dialog-heading"><div><p className="patient-eyebrow">{categoryFor(selected.kind).label}</p><h2 id="auth-modal-title">{selected.title}</h2></div><button type="button" className="mh-close-details" aria-label="Close record details" onClick={() => setSelected(null)}><X size={20}/></button></header>
        <div className="mh-details-content"><dl>
          <div><dt>Category</dt><dd>{categoryFor(selected.kind).label}</dd></div><div><dt>Date</dt><dd>{formatPatientDate(selected.date)}</dd></div>
          <div><dt>Doctor</dt><dd>{selected.doctor}</dd></div><div><dt>Record status</dt><dd>{statusLabel(selected.status)}</dd></div>
          {selected.bookingStatus && <div><dt>Booking status</dt><dd>{statusLabel(selected.bookingStatus)}</dd></div>}
          <div className="mh-detail-full"><dt>Description</dt><dd>{selected.description}</dd></div>
          <div className="mh-detail-full"><dt>Result availability</dt><dd>{resultLabel(selected)}</dd></div>
        </dl>{selected.demo && <p className="mh-demo-note"><span className="patient-demo-badge">DEMO DATA</span>This fictional demo record is for demonstration purposes.</p>}
        {reportError && <p className="patient-form-error" role="alert">{reportError}</p>}
        <div className="mh-detail-actions">{selected.attachmentPath && selected.resultAvailable && !selected.demo && <button type="button" className="patient-secondary-button" disabled={openingReport} onClick={() => void openReport(selected)}>{openingReport ? "Opening report..." : "View released report"}</button>}<button type="button" className="patient-secondary-button" onClick={() => setSelected(null)}>Close details</button></div></div>
      </div>}
    </Modal>
    {visible.length > 0 && <p className="mh-footer-note"><FileText size={14} aria-hidden="true"/>Your records are shared securely by your care team.</p>}
  </section>;
}
