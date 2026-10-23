import type { Metadata } from "next";

import { FAQAccordion } from "@/components/faq/FAQAccordion";
import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description: "Read answers to common patient questions about appointments, doctors, hospital services, and support.",
};

export default function FaqPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle eyebrow="Questions" title="Frequently Asked Questions" description="Helpful answers for our most common patient and client inquiries." />
      </div>

      <FAQAccordion />
    </div>
  );
}
