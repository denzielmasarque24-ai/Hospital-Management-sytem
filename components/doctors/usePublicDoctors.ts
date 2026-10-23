"use client";

import { useEffect, useState } from "react";
import { getPublicDoctors } from "@/lib/services/public-service";

export type PublicDoctor = {
  id: string;
  name: string;
  specialty: string;
  department: string | null;
  subSpecialization: string | null;
  canBook: boolean;
  title: string;
  biography: string;
  experience: string;
  availability: string;
  image: string | null;
  fallbackImage: string | null;
  isDemo: boolean;
  href: string;
};

function logDoctorError(error: unknown) {
  const details = error && typeof error === "object"
    ? error as { status?: number; code?: string; message?: string; details?: string; hint?: string }
    : null;
  // This request failure is handled in the UI; warning logs preserve the API
  // diagnostics without triggering Next.js' development error overlay.
  console.warn("[usePublicDoctors] Failed to load public doctor profiles:", {
    status: details?.status,
    code: details?.code,
    message: details?.message ?? (error instanceof Error ? error.message : String(error)),
    details: details?.details,
    hint: details?.hint,
  });
}

export function usePublicDoctors() {
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await getPublicDoctors();
        if (!active) return;
        setDoctors(data.map((doctor) => ({
          id: doctor.id,
          name: doctor.display_name?.trim() || "Doctor name not listed",
          specialty: doctor.specialty?.trim() || "Specialization not listed",
          department: doctor.department ?? null,
          subSpecialization: doctor.sub_specialization ?? null,
          canBook: doctor.available === true || doctor.available === "true",
          title: doctor.professional_title ?? "",
          biography: doctor.biography ?? "",
          experience: doctor.experience ?? "",
          availability: doctor.available === true || doctor.available === "true" ? "Available" : "Unavailable",
          image: doctor.image_url || doctor.avatar_url || null,
          fallbackImage: doctor.image_url ? doctor.avatar_url || null : null,
          isDemo: doctor.is_demo === true,
          href: `/doctors/${encodeURIComponent(doctor.id)}`,
        })));
      } catch (reason) {
        if (!active) return;
        logDoctorError(reason);
        setError("Doctor profiles are temporarily unavailable. Please try again later.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [attempt]);

  return { doctors, loading, error, retry: () => setAttempt((current) => current + 1) };
}
