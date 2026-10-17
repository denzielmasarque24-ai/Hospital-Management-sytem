import type { Metadata } from "next";
import { SectionTitle } from "@/components/common/SectionTitle";
import { ServicesListing } from "@/components/services/ServicesListing";

export const metadata: Metadata = {
  title: "MediWell Healthcare Services",
  description: "Explore MediWell Pharma healthcare services including pharmacy, diagnostics, cardiology, pediatrics, and preventive care.",
};

export default function ServicesPage() {
  return <div className="container page-shell">
    <div className="page-banner-compact"><SectionTitle eyebrow="Our healthcare services" title="Our Healthcare Services" description="Comprehensive healthcare solutions for you and your family." /></div>
    <ServicesListing />
  </div>;
}
