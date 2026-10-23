import type { Metadata } from "next";
import Link from "next/link";

import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Patient Information",
  description: "Admission, visiting, billing, insurance, rights, and contact information for MedWell Medical Hospital patients.",
};

const patientTopics = [
  { title: "Admissions", text: "Admission requirements and intake procedures have not yet been supplied. Contact the hospital before your visit.", href: "/contact", action: "Ask about admission" },
  { title: "Visiting Hours", text: "Current visiting hours have not yet been supplied. Please contact the hospital to confirm before traveling.", href: "/contact", action: "Ask about visiting" },
  { title: "Billing & Payment", text: "Billing procedures and accepted payment methods have not yet been supplied. Contact the hospital for current details.", href: "/contact", action: "Ask about billing" },
  { title: "Insurance & HMO", text: "Participating insurers and HMO plans have not yet been supplied. Confirm coverage with the hospital and your provider.", href: "/contact", action: "Ask about coverage" },
  { title: "Patient Care & Safety", text: "Hospital-specific care and safety procedures have not yet been supplied. Contact the hospital for current policies and patient guidance.", href: "/contact", action: "Request safety information" },
  { title: "Patient Rights & Responsibilities", text: "Hospital-specific patient rights and responsibilities information has not yet been supplied. Please request the current policy from the hospital.", href: "/contact", action: "Request patient information" },
  { title: "Frequently Asked Questions", text: "Find answers to common questions about appointments, doctors, and available services.", href: "/faq", action: "View FAQs" },
  { title: "Contact & Directions", text: "The hospital address and directions have not yet been supplied. Send a message to request verified location information.", href: "/contact", action: "Contact the hospital" },
];

export default function PatientInformationPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Patient resources"
          title="Patient Information"
          description="Practical information for patients and families. Hospital-specific details that have not been provided are clearly marked so you can confirm them with the care team."
        />
      </div>
      <section className="page-section" id="room-rates" aria-labelledby="room-rates-title">
        <div className="info-card">
          <h2 id="room-rates-title">Patient Room Rates</h2>
          <p>Review the room categories and request verified pricing and admission details from the hospital.</p>
          <Link className="text-link" href="/room-rates">View room categories and rates →</Link>
        </div>
      </section>
      <div className="help-topic-grid">
        {patientTopics.map((topic) => (
          <article key={topic.title} className="help-topic-card">
            <h3>{topic.title}</h3>
            <p>{topic.text}</p>
            <Link className="text-link" href={topic.href}>{topic.action} →</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
