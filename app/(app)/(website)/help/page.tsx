import type { Metadata } from "next";

import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Help Center",
  description: "Find answers and guidance for appointments, doctors, pharmacy, lab tests, and more at MediWell Pharma.",
};

const helpTopics = [
  { title: "Appointments", description: "Book, confirm, or reschedule consultations in a few quick steps." },
  { title: "Doctors", description: "Search by specialty and learn about clinician availability and expertise." },
  { title: "Pharmacy", description: "Place medicine orders and explore product categories with ease." },
  { title: "Lab Tests", description: "Choose diagnostic services and find the right screening options." },
  { title: "Payments", description: "Understand billing, deposits, and payment support for services and products." },
  { title: "Emergency Services", description: "Get immediate guidance on urgent care and after-hours support." },
];

export default function HelpPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Support"
          title="Help Center"
          description="Find the guidance you need for appointments, care, pharmacy, and diagnostic services."
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
