import type { Metadata } from "next";

import { ProductCatalog } from "@/components/products/ProductCatalog";
import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "MediWell Pharma Products",
  description: "Browse MediWell Pharma products across prescriptions, wellness, personal care, and medical devices.",
};

export default function ProductsPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Pharmaceutical catalog"
          title="Our Products"
          description="Trusted solutions for everyday wellness, treatment, and preventative care."
        />
      </div>

      <ProductCatalog />
    </div>
  );
}
