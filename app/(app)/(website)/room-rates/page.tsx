import type { Metadata } from "next";
import { BedDouble, CircleHelp } from "lucide-react";
import { SectionTitle } from "@/components/common/SectionTitle";
import { RoomRatesGrid } from "@/components/rooms/RoomRatesGrid";

export const metadata: Metadata = {
  title: "Patient Room Rates | MedWell Medical Hospital",
  description: "Explore patient room categories at MedWell Medical Hospital, with verified room specifications and daily rates where available.",
};

export default function RoomRatesPage() {
  return <div className="container page-shell room-rates-page">
    <div className="page-banner-compact room-rates-heading">
      <SectionTitle eyebrow="Patient information" title="Patient Room Rates" description="Browse room categories, photographs, and verified room details. Unconfirmed rates and specifications are clearly marked." />
      <span className="room-rates-heading-icon" aria-hidden="true"><BedDouble size={26}/></span>
    </div>
    <div className="room-rates-notice" role="note"><CircleHelp size={17} aria-hidden="true"/><p>Rates and some room specifications remain unconfirmed where noted. Contact the hospital for current pricing, availability, and admission information.</p></div>
    <RoomRatesGrid />
  </div>;
}
