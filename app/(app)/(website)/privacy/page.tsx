import type { Metadata } from "next";

import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Read the MedWell Medical Hospital privacy policy explaining how personal information is handled and protected.",
};

export default function PrivacyPage() {
  return (
    <div className="container page-shell policy-page">
      <div className="page-banner-compact">
        <SectionTitle eyebrow="Legal" title="Privacy Policy" description="This policy explains how MedWell Medical Hospital manages personal information and protects your privacy." />
      </div>

      <div className="info-card">
        <h3>Information We Collect</h3>
        <p>We may collect personal health and contact information needed to deliver care, support, and service requests. This includes details provided through forms, appointments, and communication channels.</p>
      </div>

      <div className="info-card" style={{ marginTop: '20px' }}>
        <h3>How We Use Information</h3>
        <p>Information is used to respond to appointment requests, provide requested website services, and support communication with the hospital. See the hospital’s approved privacy notice for the complete details about data handling and sharing.</p>
      </div>

      <div className="info-card" style={{ marginTop: '20px' }}>
        <h3>Security</h3>
        <p>We use reasonable administrative, technical, and physical safeguards to protect personal information from unauthorized access, loss, or misuse. While we aim for strong security, no online system is entirely risk-free.</p>
      </div>
    </div>
  );
}
