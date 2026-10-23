import type { Metadata } from "next";

import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Read the MedWell Medical Hospital terms and conditions for using the website and its services.",
};

export default function TermsPage() {
  return (
    <div className="container page-shell policy-page">
      <div className="page-banner-compact">
        <SectionTitle eyebrow="Legal" title="Terms & Conditions" description="These terms govern your use of MedWell Medical Hospital website content and configured services." />
      </div>

      <div className="info-card">
        <h3>General Terms</h3>
        <p>By using our website or services, you agree to comply with all applicable laws and standards. Information on this site is for informational and educational purposes and should not replace professional medical advice.</p>
      </div>

      <div className="info-card" style={{ marginTop: '20px' }}>
        <h3>Medical Information</h3>
        <p>Medical advice, treatment recommendations, and service availability may change based on individual circumstances. Always consult a qualified healthcare professional for personalized care and diagnosis.</p>
      </div>

      <div className="info-card" style={{ marginTop: '20px' }}>
        <h3>Website Use</h3>
        <p>Users must not misuse the website, attempt unauthorized access, or submit harmful or abusive content. MedWell Medical Hospital may restrict access when necessary to maintain service quality and safety.</p>
      </div>
    </div>
  );
}
