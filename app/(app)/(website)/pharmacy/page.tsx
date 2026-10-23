import type { Metadata } from "next";
import { ProductCatalog } from "@/components/products/ProductCatalog";
import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Medical Products & Supplies",
  description: "Browse the configured medical products catalog from MedWell Medical Hospital.",
};

export default function PharmacyPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Medical products"
          title="Medical Products & Supplies"
          description="Browse items currently listed in the hospital catalog. Confirm availability and suitability with the hospital team."
        />
      </div>
      <ProductCatalog />
    </div>
  );
}
