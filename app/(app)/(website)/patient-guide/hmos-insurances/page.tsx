import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Info } from "lucide-react";
import { insurancePartners as providers } from "@/lib/insurance/partners";

export const metadata: Metadata = {
  title: "HMOs & Insurances | MedWell Medical Hospital",
  description: "HMO and insurance provider directory information for MedWell Medical Hospital.",
};



export default function HmosInsurancesPage() {
  return (
    <main className="insurance-directory-page">
      <div className="insurance-breadcrumb-band">
        <div className="container">
          <nav className="insurance-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">/</span>
            <span>Patient Guide</span>
            <span aria-hidden="true">/</span>
            <span aria-current="page">HMOs &amp; Insurances</span>
          </nav>
        </div>
      </div>

      <section className="insurance-page-hero">
        <div className="container insurance-page-hero-inner">
          <span className="insurance-eyebrow"><i /> PATIENT GUIDE</span>
          <h1>HMOs &amp; Insurances</h1>
          <p>Explore HMO and insurance provider names referenced for MedWell Medical Hospital. Please contact the hospital to confirm your coverage and eligibility.</p>
        </div>
      </section>

      <section className="container insurance-directory-section" aria-labelledby="insurance-partners-title">
        <header className="insurance-section-heading">
          <span className="insurance-eyebrow"><i /> OUR PARTNERS</span>
          <h2 id="insurance-partners-title">Our HMO &amp; Insurance Partners</h2>
          <p>Provider names are shown for directory purposes only. This list does not confirm current accreditation or acceptance.</p>
        </header>

        <ul className="insurance-provider-grid" aria-label="HMO and insurance provider logos">
          {providers.map((provider) => (
            <li className="insurance-provider-card" key={provider.name}>
              <div className="insurance-provider-image">
                <Image
                  src={provider.src}
                  alt={provider.name}
                  fill
                  sizes="(max-width: 680px) 44vw, (max-width: 1100px) 29vw, 18vw"
                  className="insurance-provider-logo"
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="container insurance-verification-wrap" aria-labelledby="insurance-verification-title">
        <div className="insurance-verification-panel">
          <span className="insurance-verification-icon"><Info size={23} aria-hidden="true" /></span>
          <div>
            <h2 id="insurance-verification-title">Insurance Coverage &amp; Verification</h2>
            <p>Insurance benefits, accreditation, and coverage may vary. Please contact MedWell Medical Hospital or your insurance provider to verify your eligibility and covered services before your visit.</p>
          </div>
          <Link href="/contact" className="insurance-contact-button">Contact Us <ArrowRight size={17} aria-hidden="true" /></Link>
        </div>
      </section>
    </main>
  );
}
