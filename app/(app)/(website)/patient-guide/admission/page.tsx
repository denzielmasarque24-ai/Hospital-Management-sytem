import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BedDouble,
  ClipboardCheck,
  ClipboardList,
  Check,
  HeartPulse,
  Info,
  Siren,
  Stethoscope,
  UserRoundCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "How to Get Admitted",
  description: "Your step-by-step guide to hospital admission at MedWell Medical Hospital.",
};

const admissionSteps = [
  { title: "Consultation & Assessment", description: "The patient consults a doctor for medical evaluation to determine the need for admission.", icon: Stethoscope, image: "/images/carousel/p5.jpg", imageAlt: "Medical symbols representing clinical assessment" },
  { title: "Admission Recommendation", description: "The doctor provides an admission recommendation or order based on the patient's condition.", icon: ClipboardCheck, image: "/images/carousel/p1.jpg", imageAlt: "Hospital patient care setting" },
  { title: "Registration & Verification", description: "Hospital admissions staff verify patient information and any required documents.", icon: UserRoundCheck, image: "/images/carousel/p3.jpg", imageAlt: "Hospital waiting and reception area" },
  { title: "Room & Bed Assignment", description: "Hospital staff check room and bed availability and readiness.", icon: BedDouble, image: "/images/carousel/p4.jpg", imageAlt: "Hospital room with patient beds" },
  { title: "Admission Confirmation", description: "Authorized hospital staff confirm the admission and update the patient's records.", icon: BadgeCheck, image: "/images/carousel/p3.jpg", imageAlt: "Hospital waiting and reception area" },
  { title: "Proceed to Assigned Room", description: "Hospital staff assist the patient in proceeding to the assigned room and provide initial orientation.", icon: HeartPulse, image: "/images/carousel/p4.jpg", imageAlt: "Hospital room prepared for patient care" },
];

const admissionReminders = [
  "Bring a valid ID and required documents.",
  "Prepare health records, test results, and medication list if available.",
  "Follow hospital staff instructions.",
  "Ask our staff if you have any questions.",
];

export default function AdmissionGuidePage() {
  return (
    <div className="admission-guide-page">
      <div className="admission-breadcrumb-band">
        <div className="container">
          <nav className="admission-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link><span aria-hidden="true">/</span><span>Patient Guide</span><span aria-hidden="true">/</span><span aria-current="page">How to Get Admitted</span>
          </nav>
        </div>
      </div>
      <section className="admission-guide-hero">
        <div className="container admission-guide-content">
          <div className="admission-guide-intro">
            <span className="admission-guide-eyebrow">PATIENT GUIDE</span>
            <h1>How to Get Admitted</h1>
            <p>Your step-by-step guide to hospital admission at MedWell Medical Hospital.</p>
          </div>
        </div>
      </section>

      <section className="container admission-process-section" aria-labelledby="admission-process-title">
        <header className="admission-section-heading">
          <h2 id="admission-process-title">Admission Process</h2>
          <p>Your admission, step by step</p>
        </header>
        <ol className="admission-steps-grid">
          {admissionSteps.map(({ title, description, icon: Icon, image, imageAlt }, index) => (
            <li className="admission-step-card" key={title}>
              <span className="admission-step-number">{index + 1}</span>
              <span className="admission-step-image"><img src={image} alt={imageAlt} loading="lazy" /></span>
              <span className="admission-step-icon"><Icon size={34} strokeWidth={1.7} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
        <section className="admission-reminders-panel" aria-labelledby="admission-reminders-title">
          <h2 id="admission-reminders-title">Important Reminders</h2>
          <ul className="admission-reminders" aria-label="Admission reminders">
            {admissionReminders.map((reminder) => <li key={reminder}><Check size={17} strokeWidth={2.5} aria-hidden="true" /><span>{reminder}</span></li>)}
          </ul>
        </section>
        <div className="admission-availability-note">
          <Info size={20} aria-hidden="true" />
          <p>Admission and room assignments must be confirmed by authorized hospital staff. Room availability and assignment depend on the hospital&apos;s current capacity and medical assessment.</p>
        </div>
      </section>

      <section className="container admission-emergency-wrap" aria-label="Emergency patients">
        <div className="admission-reminder-card admission-emergency-card">
          <span className="admission-reminder-icon"><Siren size={28} aria-hidden="true" /></span>
          <div><h2>For Emergency Patients</h2><p>For medical emergencies, proceed directly to the Emergency Department. Do not delay seeking immediate medical attention.</p></div>
        </div>
      </section>

      <section className="container admission-contact-wrap">
        <div className="admission-contact-panel">
          <span className="admission-contact-icon"><ClipboardList size={27} aria-hidden="true" /></span>
          <div className="admission-contact-copy"><span className="admission-guide-eyebrow">PATIENT SUPPORT</span><h2>Need More Information?</h2><p>Contact our Admissions Desk for assistance or visit our Contact page.</p></div>
          <Link href="/contact" className="admission-contact-button">Contact Us <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
      </section>
    </div>
  );
}
