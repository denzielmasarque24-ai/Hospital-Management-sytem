import type { Metadata } from "next";
import { ServicesDirectory } from "@/components/services/ServicesDirectory";

export const metadata: Metadata = {
  title: "Services & Facilities | MedWell Medical Hospital",
  description: "Browse healthcare services listed by MedWell Medical Hospital.",
};

export default function ServicesPage() {
  return <main className="services-directory-page services-facilities-page">
    <div className="container">
      <header className="services-directory-header">
        <span className="services-directory-eyebrow">MEDWELL MEDICAL HOSPITAL</span>
        <h1>Services &amp; Facilities</h1>
        <p>Explore the services currently listed by MedWell Medical Hospital. Select a service to view its details.</p>
      </header>
      <section className="services-directory-section" aria-labelledby="services-directory-title">
        <div className="services-directory-intro">
          <div>
            <span className="services-directory-eyebrow">OUR SERVICES</span>
            <h2 id="services-directory-title">What We Offer</h2>
            <p>Browse confirmed hospital services and select a listing for details or inquiries.</p>
          </div>
        </div>
        <ServicesDirectory section="services_facilities" />
      </section>
    </div>
  </main>;
}
