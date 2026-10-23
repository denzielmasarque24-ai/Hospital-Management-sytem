import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, BriefcaseMedical, CalendarDays, Check, Clock3, GraduationCap, MapPin, Stethoscope } from "lucide-react";
import { getPublicDoctorById } from "@/lib/services/public-service";
import { DoctorAvatar } from "@/components/doctors/DoctorAvatar";
import { DoctorProfileBackButton } from "@/components/doctors/DoctorProfileBackButton";

export const metadata: Metadata = { title: "Doctor Profile", description: "Professional profile and availability information for a MedWell doctor." };

export default async function DoctorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let doctor;
  try { doctor = await getPublicDoctorById(id); }
  catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("[DoctorProfilePage] Failed to load public doctor:", error);
    throw new Error("Doctor profile is temporarily unavailable.");
  }
  if (!doctor) notFound();

  const name = doctor.display_name?.trim() || "Doctor profile";
  const nameWithoutTitle = name.replace(/^(?:dr\.?\s*)+/i, "").trim() || name;
  const image = doctor.image_url || doctor.avatar_url;
  const available = doctor.available === true || doctor.available === "true";
  const education = Array.isArray(doctor.education) ? doctor.education.filter(value => typeof value === "string").join(" · ") : doctor.education?.trim();
  const fee = doctor.consultation_fee == null || doctor.consultation_fee === "" ? null : Number(doctor.consultation_fee);
  const years = doctor.experience_years == null || doctor.experience_years === "" ? null : Number(doctor.experience_years);

  return <main className="doctor-redesign">
    <div className="container doctor-redesign-container">
      <DoctorProfileBackButton />
      <div className="doctor-redesign-grid">
        <div className="doctor-main-column">
          <header className="doctor-hero-card">
            <DoctorAvatar image={image} name={name} className="doctor-hero-photo" fill size={250}/>
            <div className="doctor-hero-copy">
              <span className="doctor-brand">MEDWELL MEDICAL HOSPITAL</span>
              {doctor.is_demo && <span className="doctor-demo-chip">DEMO PROFILE — FICTIONAL DOCTOR</span>}
              <h1>{name}</h1>
              <p className="doctor-hero-specialty">{doctor.specialty || "Specialization not listed"}</p>
              <div className="doctor-classifications">
                {doctor.department && <span className="doctor-chip doctor-chip-green">{doctor.department}</span>}
                {doctor.specialty && <span className="doctor-chip">{doctor.specialty}</span>}
                {doctor.sub_specialization && <span className="doctor-chip doctor-chip-teal">{doctor.sub_specialization}</span>}
              </div>
              <div className="doctor-hero-meta">
                {Number.isFinite(years) && years !== null && <span><BriefcaseMedical size={17}/>{years} {years === 1 ? "year" : "years"} of experience</span>}
                <span className={available ? "doctor-available" : "doctor-unavailable"}><Clock3 size={17}/>{available ? "Available for appointments" : "Unavailable for online booking"}</span>
              </div>
            </div>
          </header>

          <section className="doctor-info-card" aria-labelledby="doctor-about"><h2 id="doctor-about"><span><BookOpen size={20}/></span>About Dr. {nameWithoutTitle}</h2><p className="doctor-copy whitespace-pre-line">{doctor.bio?.trim() || "Biography not yet available."}</p></section>
          <section className="doctor-info-card" aria-labelledby="doctor-expertise"><h2 id="doctor-expertise"><span className="doctor-icon-green"><Stethoscope size={20}/></span>Areas of Expertise</h2>
            {doctor.specialty || doctor.sub_specialization ? <ul className="doctor-expertise-list">{doctor.specialty && <li><Check size={17}/><span><small>Specialization</small>{doctor.specialty}</span></li>}{doctor.sub_specialization && <li><Check size={17}/><span><small>Sub-specialization</small>{doctor.sub_specialization}</span></li>}</ul> : <p className="doctor-copy">Detailed areas of expertise are not available.</p>}
          </section>
          <section className="doctor-info-card" aria-labelledby="doctor-education"><h2 id="doctor-education"><span><GraduationCap size={21}/></span>Education</h2><p className="doctor-copy">{education || "Education details not available."}</p></section>
        </div>

        <aside className="doctor-sidebar">
          <section className="doctor-action-card"><h2>Book an Appointment</h2><p>Request a consultation with {name}.</p>{available ? <Link className="doctor-book-button" href={`/appointment?doctor=${encodeURIComponent(doctor.id)}`}><CalendarDays size={19}/>Book Appointment</Link> : <button className="doctor-book-button" disabled>Currently Unavailable</button>}<Link className="doctor-secondary-button" href="/contact">Contact the Hospital</Link></section>
          <section className="doctor-info-card doctor-consult-card"><h2><span className="doctor-icon-teal"><Clock3 size={20}/></span>Consultation Information</h2><dl>
            <div><dt>Consultation Fee</dt><dd>{fee !== null && Number.isFinite(fee) ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(fee) : "Not available"}</dd></div>
            <div><dt>Availability</dt><dd className={available ? "doctor-available" : "doctor-unavailable"}>{available ? "Available" : "Unavailable"}</dd></div>
          </dl></section>
          <section className="doctor-note-card"><span><MapPin size={19}/></span><p>Appointment requests are reviewed by the hospital team. Your preferred time is confirmed after review.</p></section>
        </aside>
      </div>
    </div>
  </main>;
}
