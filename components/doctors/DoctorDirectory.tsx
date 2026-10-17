"use client";

import { useMemo, useState } from "react";
import { DoctorCard } from "./DoctorCard";
import { PUBLIC_DOCTORS } from "./publicDoctors";

export function DoctorDirectory() {
  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState("All");

  const specialties = ["All", ...Array.from(new Set(PUBLIC_DOCTORS.map((doctor) => doctor.specialty)))];
  const filteredDoctors = useMemo(() => PUBLIC_DOCTORS.filter((doctor) => {
    const matchesSpecialty = specialty === "All" || doctor.specialty === specialty;
    const search = query.toLowerCase();
    return matchesSpecialty && (doctor.name.toLowerCase().includes(search) || doctor.specialty.toLowerCase().includes(search));
  }), [query, specialty]);

  return (
    <div className="catalog-shell">
      <div className="catalog-controls">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search doctors" aria-label="Search doctors" />
        <div className="category-filter" aria-label="Choose doctor specialty">
          {specialties.map((item) => <button key={item} type="button" className={specialty === item ? "filter-chip active" : "filter-chip"} onClick={() => setSpecialty(item)}>{item}</button>)}
        </div>
      </div>
      <div className="doctor-grid">
        {filteredDoctors.map((doctor) => <DoctorCard key={doctor.name} {...doctor} />)}
      </div>
      {filteredDoctors.length === 0 ? <div className="empty-state">No doctors match your search.</div> : null}
    </div>
  );
}
