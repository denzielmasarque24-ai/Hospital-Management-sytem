import type { Metadata } from "next";

import { ProductCatalog } from "@/components/products/ProductCatalog";
import "./products.css";

export const metadata: Metadata = {
  title: "Medical Products & Supplies",
  description: "Browse items currently listed in the MedWell Medical Hospital product catalog.",
};

export default function ProductsPage() {
  return (
    <div className="container page-shell products-page">
      <section className="products-hero" aria-labelledby="products-heading">
        <div className="products-hero-copy">
          <span className="products-hero-badge">HOSPITAL CATALOG</span>
          <h1 id="products-heading">Medical Products <em>&amp; Supplies</em></h1>
          <p>Browse items currently listed in the catalog. Confirm availability and suitability with the hospital team.</p>
        </div>
      </section>

      <ProductCatalog />
    </div>
  );
}
