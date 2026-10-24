import type { Metadata } from "next";
import { BadgeCheck, ClipboardPlus, HeartHandshake } from "lucide-react";
import { ServicesDirectory } from "@/components/services/ServicesDirectory";

export const metadata: Metadata = {
  title: "Clinical Departments | MedWell Medical Hospital",
  description: "Browse clinical department listings at MedWell Medical Hospital.",
};

const departmentHighlights = [
  { title: "Expert Care", text: "Specialized medical professionals.", icon: BadgeCheck },
  { title: "Comprehensive Services", text: "A wide range of clinical specialties.", icon: ClipboardPlus },
  { title: "Patient-Centered", text: "Quality care for a healthier community.", icon: HeartHandshake },
];

export default function ClinicalDepartmentsPage() {
  return <main className="services-directory-page clinical-departments-page">
    <header className="clinical-departments-hero">
      <div className="container clinical-departments-hero-inner">
        <div className="clinical-departments-hero-copy">
          <span className="services-directory-eyebrow">MEDWELL MEDICAL HOSPITAL</span>
          <h1>Clinical Departments</h1>
          <p>Explore our specialized departments and comprehensive medical services dedicated to your health and well-being.</p>
          <div className="clinical-departments-highlights">
            {departmentHighlights.map(({ title, text, icon: Icon }) => <div className="clinical-departments-highlight" key={title}>
              <span className="clinical-departments-highlight-icon"><Icon size={19} aria-hidden="true" /></span>
              <span><strong>{title}</strong><small>{text}</small></span>
            </div>)}
          </div>
        </div>
      </div>
      <div className="clinical-departments-hero-image" aria-hidden="true" />
    </header>

    <div className="container clinical-departments-directory-wrap">
      <section className="services-directory-section clinical-departments-directory" aria-labelledby="clinical-departments-title">
        <div className="services-directory-intro">
          <div>
            <span className="services-directory-eyebrow">DEPARTMENT DIRECTORY</span>
            <h2 id="clinical-departments-title">Our Clinical Departments</h2>
            <p>Browse the hospital&apos;s current clinical department listings and select one to view its details.</p>
          </div>
        </div>
        <ServicesDirectory section="clinical_departments" />
      </section>
    </div>
  </main>;
}
