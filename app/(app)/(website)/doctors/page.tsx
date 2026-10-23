import type { Metadata } from "next";
import { UsersRound } from "lucide-react";
import { DoctorDirectory } from "@/components/doctors/DoctorDirectory";

export const metadata: Metadata = {
  title: "Our Doctors",
  description: "Meet our experienced and compassionate medical specialists.",
};

export default function DoctorsPage() {
  return <main className="directory-page">
    <header className="directory-hero">
      <div className="directory-hero-inner">
        <span className="directory-hero-icon"><UsersRound size={31} strokeWidth={1.7} aria-hidden="true"/></span>
        <div className="directory-hero-copy"><p>OUR DOCTORS</p><h1>Our Doctors</h1><span>Meet our experienced and compassionate medical specialists.</span></div>
        <div className="directory-hero-art" aria-hidden="true"><img src="/images/doctor.png" alt="" width={2048} height={768}/><span>+</span><i>+</i></div>
      </div>
    </header>
    <DoctorDirectory/>
  </main>;
}
