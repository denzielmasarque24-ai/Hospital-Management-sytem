import type { Metadata } from "next";

import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Diagnostic & Laboratory Services",
  description: "Book lab tests and diagnostics including blood work, imaging, and screening services at MediWell Pharma.",
};

const tests = [
  { title: "Blood Test", description: "Comprehensive screening for common health conditions and markers.", button: "Book Test" },
  { title: "Urinalysis", description: "Accurate urinary evaluation for hydration, infection, and metabolic health.", button: "Book Test" },
  { title: "X-Ray", description: "Fast imaging to support diagnosis for bones, lungs, and injuries.", button: "Book Test" },
  { title: "Ultrasound", description: "Detailed soft tissue images for diagnosis and monitoring.", button: "Book Test" },
  { title: "CT Scan", description: "High-resolution imaging for advanced diagnostic support.", button: "Book Test" },
  { title: "MRI", description: "Detailed scans for neurological, musculoskeletal, and organ-focused care.", button: "Book Test" },
  { title: "Health Screening", description: "Preventive assessments to keep your care proactive and informed.", button: "Book Test" },
  { title: "Diabetes Test", description: "Essential monitoring for glucose management and long-term health.", button: "Book Test" },
];

export default function LabTestsPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Diagnostics"
          title="Diagnostic & Laboratory Services"
          description="Prompt, reliable, and precise diagnostic support for your health decisions."
        />
      </div>

      <div className="lab-grid">
        {tests.map((test) => (
          <article key={test.title} className="category-card">
            <h3>{test.title}</h3>
            <p>{test.description}</p>
            <button type="button" className="btn-primary compact" style={{ marginTop: '16px' }}>
              {test.button}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
