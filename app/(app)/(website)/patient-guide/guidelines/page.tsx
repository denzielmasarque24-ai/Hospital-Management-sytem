import type { Metadata } from "next";
import Image from "next/image";
import PatientGuidelines from "@/components/patient/PatientGuidelines";

export const metadata: Metadata = {
  title: "Patient & Guest Guidelines | MedWell Medical Hospital",
  description: "General information to help patients and guests prepare for a safe and comfortable hospital visit.",
};

export default function PatientGuestGuidelinesPage() {
  return <main className="container page-shell mw-guidelines">
    <header className="mw-guide-hero">
      <div className="mw-guide-hero-copy"><p className="mw-guide-eyebrow">PATIENT RESOURCES</p><h1>Patient &amp; Guest Guidelines</h1><p>General guidance for a safe and comfortable visit to MedWell Medical Hospital.</p></div>
      <div className="mw-guide-hero-image"><Image src="/images/health.png" alt="Female healthcare worker holding a tablet at the hospital" fill sizes="(max-width: 600px) 200vw, 122vw" preload /></div>
    </header>
    <PatientGuidelines />
  </main>;
}
