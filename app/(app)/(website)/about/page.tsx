import type { Metadata } from "next";
import Link from "next/link";

import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "About MediWell Pharma",
  description: "Learn about MediWell Pharma, our mission, values, and our commitment to compassionate patient care.",
};

const stats = [
  { value: "25+", label: "Years of Excellence" },
  { value: "150+", label: "Expert Doctors" },
  { value: "500+", label: "Medical Services" },
  { value: "100K+", label: "Happy Patients" },
];

const team = [
  { name: "Dr. Aisha Morgan", role: "Chief Medical Officer" },
  { name: "Dr. Daniel Lee", role: "Director of Clinical Operations" },
  { name: "Nina Patel", role: "Pharmacy Lead" },
];

const facilities = [
  "Multispecialty outpatient clinics",
  "Advanced imaging and diagnostics",
  "Modern pharmacy and patient support",
  "24/7 urgent and emergency care",
];

export default function AboutPage() {
  return (
    <div className="container page-shell">
      <div className="page-hero">
        <SectionTitle
          eyebrow="Who we are"
          title="About MediWell Pharma"
          description="We are dedicated to providing compassionate, reliable, and advanced healthcare solutions for individuals and families.
"
        />
      </div>

      <section className="page-section">
        <div className="page-grid">
          <div className="info-card">
            <h3>Our Mission</h3>
            <p>
              To make high-quality, patient-centered care accessible and affordable through trusted pharmaceuticals,
              modern diagnostics, and specialist-led treatment.
            </p>
          </div>
          <div className="info-card">
            <h3>Our Vision</h3>
            <p>
              To build healthier communities by integrating innovation, clinical excellence, and a commitment to long-term wellbeing.
            </p>
          </div>
        </div>
      </section>

      <section className="page-section">
        <SectionTitle eyebrow="Our principles" title="Our Values" />
        <div className="feature-stack">
          <div className="callout-card">
            <h3>Patient First</h3>
            <p>Every treatment plan is designed around the needs, comfort, and long-term wellbeing of each patient.</p>
          </div>
          <div className="callout-card">
            <h3>Integrity</h3>
            <p>We uphold ethical medical practices, transparency, and the highest standards of accountability.</p>
          </div>
          <div className="callout-card">
            <h3>Innovation</h3>
            <p>We invest in modern care pathways, safe medicines, and clinical technologies that improve outcomes.</p>
          </div>
          <div className="callout-card">
            <h3>Compassion</h3>
            <p>Our team delivers care with empathy, respect, and a deep understanding of each patient journey.</p>
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="why-grid">
          <div>
            <SectionTitle
              eyebrow="Why choose us"
              title="Why Choose Us"
              description="We combine expertise, safety, and family-focused care to create a better healthcare experience."
            />
            <ul className="feature-list">
              <li>WHO-GMP Certified Medicines</li>
              <li>Advanced Clinical Infrastructure</li>
              <li>Affordable and Accessible Care</li>
              <li>Highly Experienced Network of Professionals</li>
            </ul>
          </div>

          <div className="why-visual">
            <img
              src="https://images.unsplash.com/photo-1538108149393-fbbd81895977?auto=format&fit=crop&w=900&q=80"
              alt="Healthcare facility and professionals"
            />
          </div>
        </div>
      </section>

      <section className="page-section">
        <SectionTitle eyebrow="Facilities" title="Healthcare Facilities" />
        <div className="page-grid">
          <div className="info-card">
            <h3>Care Environment</h3>
            <p>
              Our facilities are built to support efficient diagnosis, treatment, and follow-up across every stage of care.
            </p>
          </div>
          <div className="info-card">
            <h3>What We Offer</h3>
            <ul className="feature-list">
              {facilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="page-section">
        <SectionTitle eyebrow="Our team" title="Leadership & Professional Team" />
        <div className="team-grid">
          {team.map((person) => (
            <div key={person.name} className="info-card">
              <h3>{person.name}</h3>
              <p>{person.role}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="page-section">
        <SectionTitle eyebrow="Our impact" title="Numbers That Matter" />
        <div className="stats-grid">
          {stats.map((stat) => (
            <div key={stat.label} className="stat-card">
              <strong>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="page-section">
        <div className="appointment-cta">
          <div>
            <span className="section-eyebrow light">Let’s connect</span>
            <h2>Start your healthcare journey with us</h2>
          </div>
          <p>Our specialists are ready to listen, guide, and support every step of your care.</p>
          <Link href="/contact" className="btn-primary light">
            Send Us a Message
          </Link>
        </div>
      </section>
    </div>
  );
}
