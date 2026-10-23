"use client";

import { useState } from "react";
import { Stethoscope } from "lucide-react";

export function AssignedDoctorPhoto({ name, sources }: { name: string; sources: (string | null | undefined)[] }) {
  const availableSources = [...new Set(sources.map((source) => source?.trim()).filter((source): source is string => Boolean(source)))];
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const source = availableSources.find((candidate) => !failedSources.includes(candidate));

  return <div className="patient-doctor-photo-frame">
    {source ? <img src={source} alt={`Portrait of ${name}`} onError={() => setFailedSources((current) => [...current, source])}/> : <span className="patient-doctor-placeholder" role="img" aria-label={`Photo unavailable for ${name}`}><Stethoscope size={38} aria-hidden="true"/></span>}
  </div>;
}
