import type { Metadata } from "next";

import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Find guidance for appointments, doctors, hospital services, diagnostics, and patient support.",
};

const helpTopics = [
  { title: "Appointments", description: "Book, confirm, or reschedule consultations in a few quick steps." },
  { title: "Doctors", description: "Search by specialty and learn about clinician availability and expertise." },
  { title: "Medical products", description: "Browse items listed in the medical products catalog and contact the hospital to confirm availability." },
  { title: "Lab Tests", description: "Choose diagnostic services and find the right screening options." },
  { title: "Payments", description: "Billing and payment details have not yet been provided. Contact the hospital for current information." },
  { title: "Emergency Services", description: "Emergency contact and availability details have not yet been provided. For immediate emergencies, call your local emergency services." },
];

export default function HelpPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Support"
          title="Help Center"
          description="Find guidance for appointments, care services, patient information, and diagnostics. Hospital-specific details are marked where they need confirmation."
        />
      </div>

      <div className="catalog-controls">
        <input type="search" placeholder="Search help topics" aria-label="Search help topics" />
      </div>

      <div className="help-topic-grid">
        {helpTopics.map((topic) => (
          <article key={topic.title} className="help-topic-card">
            <h3>{topic.title}</h3>
            <p>{topic.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
