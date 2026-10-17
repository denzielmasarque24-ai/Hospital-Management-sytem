import type { Metadata } from "next";

import { DoctorDirectory } from "@/components/doctors/DoctorDirectory";
import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Find a Doctor",
  description: "Search and connect with trusted doctors at MediWell Pharma across specialties and care teams.",
};

export default function DoctorsPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Find a doctor"
          title="Meet Our Specialists"
          description="Consult with experienced physicians and trusted specialists tailored to your care needs."
        />
      </div>

      <DoctorDirectory />
    </div>
  );
}
