import type { Metadata } from "next";

import { CareersBoard } from "@/components/common/CareersBoard";
import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Careers at MediWell Pharma",
  description: "Explore career opportunities at MediWell Pharma and join a team committed to healthcare excellence.",
};

export default function CareersPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Join our team"
          title="Careers at MediWell Pharma"
          description="We are building a team of healthcare professionals and problem-solvers who are passionate about transforming lives."
        />
      </div>

      <CareersBoard />
    </div>
  );
}
