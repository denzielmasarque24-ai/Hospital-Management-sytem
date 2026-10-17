"use client";

import { useEffect, useState } from "react";
import { listCareers, type Career } from "@/lib/admin/managed-content";

export function CareersBoard() {
  const [selected, setSelected] = useState<Career | null>(null);
  const [jobs, setJobs] = useState<Career[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void listCareers(true).then((rows) => { if (active) setJobs(rows); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Career listings are unavailable right now."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="careers-wrap" role="status">Loading current openings…</div>;
  if (error) return <div className="careers-wrap" role="alert">Career listings could not be loaded. Please try again later.</div>;
  if (jobs.length === 0) return <div className="careers-wrap"><p>There are no open positions right now. Please check back soon.</p></div>;

  return (
    <div className="careers-wrap">
      <div className="job-list">
        {jobs.map((job) => (
          <article key={job.title} className="job-card">
            <div className="job-topline">
              <div>
                <h3>{job.title}</h3>
                <span>{job.department}</span>
              </div>
                <span className="job-type">{job.employment_type}</span>
            </div>

            <div className="job-meta">
              <span>{job.location}{job.salary_range ? ` · ${job.salary_range}` : ""}</span>
            </div>

            <p>{job.description}</p>

            {job.qualifications && <p><strong>Qualifications:</strong> {job.qualifications}</p>}
            {job.application_instructions && <p><strong>How to apply:</strong> {job.application_instructions}</p>}
            <a href="mailto:careers@mediwellpharma.com?subject=Application%20for%20${encodeURIComponent(job.title)}" className="btn-primary compact">Apply Now</a>
          </article>
        ))}
      </div>

      {selected ? (
        <div className="job-modal" aria-live="polite">
          <div className="job-modal-box">
            <h3>Application for {selected.title}</h3>
            <p>{selected.application_instructions || "Email your resume and a short introduction to careers@mediwellpharma.com."}</p>
            <a className="btn-primary compact" href={`mailto:careers@mediwellpharma.com?subject=${encodeURIComponent(`Application for ${selected.title}`)}`}>Email application</a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
