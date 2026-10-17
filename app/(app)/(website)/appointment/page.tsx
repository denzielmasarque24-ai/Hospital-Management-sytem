import type { Metadata } from "next";

import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Book Appointment",
  description: "Book an appointment with MediWell Pharma and speak with a specialist for your healthcare needs.",
};

export default function AppointmentPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Schedule care"
          title="Book Appointment"
          description="Choose your preferred department, date, and doctor to get started with expert medical support."
        />
      </div>

      <AppointmentForm />
    </div>
  );
}
