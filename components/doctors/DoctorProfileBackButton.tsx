"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function DoctorProfileBackButton() {
  const router = useRouter();
  return <button type="button" className="doctor-back-button" onClick={() => {
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin) && new URL(document.referrer).pathname.startsWith("/doctors")) {
      router.back();
    } else {
      router.push("/doctors");
    }
  }}><ArrowLeft size={16} aria-hidden="true"/>Back</button>;
}
