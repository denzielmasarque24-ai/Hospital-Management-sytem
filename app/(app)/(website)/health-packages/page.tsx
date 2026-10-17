import type { Metadata } from "next";

import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Health Packages",
  description: "Explore MediWell Pharma health packages that promote preventive care and long-term wellness.",
};

const packages = [
  { name: "Basic Health Check", description: "Essential diagnostics and wellness assessment for healthy adults.", tests: "CBC, blood sugar, vitals", price: "$89" },
  { name: "Complete Health Check", description: "Thorough screening for early detection and better long-term outcomes.", tests: "Full blood panel, liver, kidney, ECG", price: "$169" },
  { name: "Executive Health Package", description: "Premium evaluation for professionals and busy executives.", tests: "Advanced imaging, labs, consultation", price: "$299" },
  { name: "Women’s Health Package", description: "Focused preventive care for hormones, bone, and reproductive wellness.", tests: "CBC, thyroid, vitamins, pelvic screening", price: "$179" },
  { name: "Men’s Health Package", description: "Structured testing for heart, metabolic, and lifestyle health.", tests: "Cholesterol, glucose, inflammation, cardiorespiratory review", price: "$179" },
  { name: "Senior Citizen Package", description: "Tailored preventive healthcare for aging adults.", tests: "Bone health, kidney, heart, sugar, immunity", price: "$199" },
];

export default function HealthPackagesPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Preventive care"
          title="Health Packages"
          description="Proactive health checkups designed to help you stay ahead of potential issues."
        />
      </div>

      <div className="package-grid">
        {packages.map((pkg) => (
          <article key={pkg.name} className="package-card">
            <h3>{pkg.name}</h3>
            <p>{pkg.description}</p>
            <p><strong>Includes:</strong> {pkg.tests}</p>
            <div className="product-meta">
              <strong>{pkg.price}</strong>
              <button type="button" className="btn-primary compact">
                Book Package
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
