import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, HandHeart, IdCard, MessageCircle, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Patient & Guest Guidelines | MedWell Medical Hospital",
  description: "General information to help patients and guests prepare for a safe and comfortable hospital visit.",
};

const guidance = [
  {
    title: "Before your visit",
    text: "Contact the hospital to confirm your appointment, current visiting arrangements, and any documents you may need. Bring identification and relevant health information when available.",
    icon: IdCard,
  },
  {
    title: "Help keep care spaces safe",
    text: "Clean your hands when entering and leaving care areas, follow posted instructions, and ask hospital staff if you are unsure where to go.",
    icon: ShieldCheck,
  },
  {
    title: "Respect patients and visitors",
    text: "Please keep conversations considerate and protect the privacy of patients and other guests. Ask before taking photos or recordings.",
    icon: HandHeart,
  },
  {
    title: "Ask the care team",
    text: "Hospital arrangements can vary by department and patient needs. Staff can help clarify visitor access, support person arrangements, and other visit questions.",
    icon: MessageCircle,
  },
];

export default function PatientGuestGuidelinesPage() {
  return (
    <main className="container page-shell patient-guidelines-page">
      <header className="page-banner-compact">
        <p className="section-eyebrow">PATIENT &amp; GUEST RESOURCES</p>
        <h1>Patient &amp; Guest Guidelines</h1>
        <p>General guidance for a safe and comfortable visit to MedWell Medical Hospital.</p>
      </header>

      <p className="patient-guidelines-notice">
        These are general visit guidelines, not department-specific hospital policies. Please contact the hospital to confirm current visiting hours, access arrangements, and requirements before your visit.
      </p>

      <section className="patient-guidelines-grid" aria-label="General patient and guest guidance">
        {guidance.map(({ title, text, icon: Icon }) => (
          <article className="patient-guideline-card" key={title}>
            <span className="patient-guideline-icon"><Icon size={22} aria-hidden="true" /></span>
            <div><h2>{title}</h2><p>{text}</p></div>
          </article>
        ))}
      </section>

      <section className="patient-guidelines-contact">
        <div><h2>Need current hospital information?</h2><p>Contact our team to confirm visit details and hospital-specific guidelines.</p></div>
        <Link href="/contact">Contact the Hospital <ArrowRight size={17} aria-hidden="true" /></Link>
      </section>
    </main>
  );
}
