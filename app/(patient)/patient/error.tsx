"use client";

import { TriangleAlert } from "lucide-react";

export default function PatientError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <section className="patient-card patient-query-error" role="alert">
    <TriangleAlert size={26}/>
    <h2>Your patient records could not be displayed</h2>
    <p>Please try again. If the problem continues, contact your MedWell care team.</p>
    <div className="patient-action-links"><button className="patient-secondary-button" onClick={retry}>Try again</button><a className="patient-secondary-button" href="/contact">Contact the hospital</a></div>
  </section>;
}
