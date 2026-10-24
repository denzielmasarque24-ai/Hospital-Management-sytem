import type { Metadata } from "next";
import { HeartPulse, TrendingUp, UsersRound } from "lucide-react";

import { CareersBoard } from "@/components/common/CareersBoard";

export const metadata: Metadata = {
  title: "Careers at MedWell Medical Hospital",
  description: "View current job listings published by MedWell Medical Hospital.",
};

const careerHighlights = [
  { label: "Meaningful Work", icon: HeartPulse },
  { label: "Professional Growth", icon: TrendingUp },
  { label: "Supportive Team", icon: UsersRound },
];

export default function CareersPage() {
  return (
    <main className="careers-page">
      <section className="careers-hero" aria-labelledby="careers-title">
        <img className="careers-hero-image" src="/images/careers/careers.png" alt="MedWell healthcare professionals working together" fetchPriority="high" />
        <div className="careers-hero-wash" aria-hidden="true" />
        <div className="container careers-hero-inner">
          <div className="careers-hero-copy">
            <span className="careers-eyebrow"><i /> JOIN OUR TEAM</span>
            <h1 id="careers-title">Careers at MedWell Medical Hospital</h1>
            <p>We are building a team of healthcare professionals and problem-solvers who are passionate about transforming lives.</p>
            <ul className="careers-highlights" aria-label="Working at MedWell">
              {careerHighlights.map(({ label, icon: Icon }) => (
                <li key={label}><span><Icon size={17} strokeWidth={2} aria-hidden="true" /></span>{label}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <CareersBoard />
    </main>
  );
}
