"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseMedical, Building2, MapPin, X } from "lucide-react";
import { listCareers, type Career } from "@/lib/admin/managed-content";

export function CareersBoard() {
  const [selected, setSelected] = useState<Career | null>(null);
  const [jobs, setJobs] = useState<Career[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void listCareers(true)
      .then((rows) => { if (active) setJobs(rows); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Career listings are unavailable right now."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  return (
    <section className="careers-directory" aria-labelledby="open-positions">
      <div className="container careers-directory-inner">
        <div className="careers-positions-heading">
          <div>
            <span className="careers-eyebrow"><i /> CAREER OPPORTUNITIES</span>
            <h2 id="open-positions">Open Positions</h2>
          </div>
          {!loading && !error ? <p>{jobs.length} {jobs.length === 1 ? "position" : "positions"} available</p> : null}
        </div>

        {loading ? <div className="careers-state" role="status">Loading current openings…</div> : null}
        {error ? <div className="careers-state careers-error" role="alert">Career listings could not be loaded. Please try again later.</div> : null}
        {!loading && !error && jobs.length > 0 ? (
          <div className="job-list">
            {jobs.map((job) => (
              <article key={job.id || `${job.title}-${job.department}`} className="job-card">
                <div className="careers-card-topline">
                  <span className="careers-job-icon"><BriefcaseMedical size={21} strokeWidth={1.8} aria-hidden="true" /></span>
                  <span className="job-type">{job.employment_type}</span>
                </div>
                <h3>{job.title}</h3>
                <div className="careers-job-meta">
                  <span><Building2 size={15} aria-hidden="true" />{job.department}</span>
                  <span><MapPin size={15} aria-hidden="true" />{job.location}</span>
                </div>
                <p className="careers-job-description">{job.description}</p>
                <button type="button" onClick={() => setSelected(job)} className="careers-view-details">View Details <ArrowRight size={16} aria-hidden="true" /></button>
              </article>
            ))}
          </div>
        ) : null}
        {!loading && !error && jobs.length === 0 ? (
          <div className="careers-state careers-empty-state">
            <span className="careers-job-icon"><BriefcaseMedical size={22} aria-hidden="true" /></span>
            <h3>No open positions right now</h3>
            <p>Please check back soon for new opportunities.</p>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="job-modal careers-modal" onClick={() => setSelected(null)}>
          <div className="job-modal-box careers-modal-box" role="dialog" aria-modal="true" aria-labelledby="career-application-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="careers-modal-close" aria-label="Close job details" onClick={() => setSelected(null)}><X size={20} aria-hidden="true" /></button>
            <span className="careers-eyebrow"><i /> OPEN POSITION</span>
            <h3 id="career-application-title">{selected.title}</h3>
            <div className="careers-modal-meta"><span><Building2 size={15} aria-hidden="true" />{selected.department}</span><span><MapPin size={15} aria-hidden="true" />{selected.location}</span><span><BriefcaseMedical size={15} aria-hidden="true" />{selected.employment_type}</span></div>
            {selected.salary_range ? <p className="careers-modal-salary">{selected.salary_range}</p> : null}
            <h4>About the role</h4>
            <p>{selected.description}</p>
            {selected.qualifications ? <><h4>Qualifications</h4><p>{selected.qualifications}</p></> : null}
            {selected.application_instructions ? <><h4>How to apply</h4><p>{selected.application_instructions}</p></> : <p>Application instructions have not been provided for this listing. Contact the hospital through the message page for details.</p>}
            <div className="careers-modal-actions">
              {!selected.application_instructions ? <a className="btn-primary compact" href="/contact">Contact the hospital</a> : null}
              <button className="btn-outline compact" type="button" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
