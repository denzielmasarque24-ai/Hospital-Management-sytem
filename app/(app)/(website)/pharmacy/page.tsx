import type { Metadata } from "next";
import Link from "next/link";

import { SectionTitle } from "@/components/common/SectionTitle";
import { formatPhp } from "@/lib/currency";

export const metadata: Metadata = {
  title: "MediWell Pharmacy",
  description: "Browse trusted medicines and wellness products from the MediWell Pharmacy online catalog.",
};

const featured = [
  { name: "ApexRelief Plus", image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=700&q=80" },
  { name: "PureVital Multivitamin", image: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=700&q=80" },
  { name: "HeartCare Capsules", image: "https://images.unsplash.com/photo-1607619056574-7b8d3ee536b2?auto=format&fit=crop&w=700&q=80" },
];

const categories = ["Prescription Medicines", "Health & Wellness", "OTC Essentials", "Personal Care"];

export default function PharmacyPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Online pharmacy"
          title="Online Pharmacy"
          description="Access essential medications, wellness support, and everyday healthcare products from our trusted pharmacy services."
        />
      </div>

      <div className="catalog-controls">
        <input type="search" placeholder="Search medicines" aria-label="Search medicines" />
        <button type="button" className="btn-primary">
          View Products
        </button>
      </div>

      <section className="page-section">
        <SectionTitle eyebrow="Featured" title="Featured Medicines" />
        <div className="product-grid">
          {featured.map((item) => (
            <article key={item.name} className="product-card">
              <div className="product-image-wrap">
                <img src={item.image} alt={item.name} className="product-image" />
              </div>
              <div className="product-content">
                <h3>{item.name}</h3>
                <div className="product-meta">
                  <strong>{formatPhp(24)}</strong>
                  <Link href="/products" className="text-link">
                    View Product
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="page-section">
        <SectionTitle eyebrow="Popular categories" title="Popular Categories" />
        <div className="help-topic-grid">
          {categories.map((category) => (
            <div key={category} className="help-topic-card">
              <h3>{category}</h3>
              <p>Curated products selected for convenience, efficacy, and trust.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
