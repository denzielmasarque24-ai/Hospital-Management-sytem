import type { Metadata } from "next";
import Link from "next/link";

import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Health Packages",
  description: "Contact MedWell Medical Hospital for information about available health packages.",
};

export default function HealthPackagesPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Preventive care"
          title="Health Packages"
          description="Current health package details have not been provided. Contact the hospital to confirm available screenings, inclusions, and pricing."
        />
      </div>
      <div className="info-card">
        <h3>Package information</h3>
        <p>Ask the hospital team for current package availability and pricing before scheduling tests or making payment.</p>
        <Link href="/contact" className="btn-primary">Contact the hospital</Link>
      </div>
    </div>
  );
}
