import type { Metadata } from "next";
import Link from "next/link";

import { SectionTitle } from "@/components/common/SectionTitle";
import { ServicesListing } from "@/components/services/ServicesListing";

export const metadata: Metadata = {
  title: "Diagnostic & Laboratory Services",
  description: "Review diagnostic and laboratory services currently configured by MedWell Medical Hospital.",
};

export default function LabTestsPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Diagnostics"
          title="Diagnostic & Laboratory Services"
          description="Review the services currently listed by the hospital. To request an appointment, submit your preferred date and time; the request is not confirmed until the hospital contacts you."
        />
      </div>
      <ServicesListing />
      <div className="page-section">
        <Link href="/appointment" className="btn-primary">Request an appointment</Link>
      </div>
    </div>
  );
}
