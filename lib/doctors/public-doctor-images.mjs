const DOCTOR_PHOTO_FALLBACKS = Object.freeze({
  "Dr. Ethan Mercado": "/images/doctors/d8.png",
  "Dr. Gabriel Flores": "/images/doctors/d9.jpg",
  "Dr. Isabella Torres": "/images/doctors/d10.jpg",
  "Dr. Juan Reyes": "/images/doctors/d11.jpg",
  "Dr. Lucas Herrera": "/images/doctors/d12.jpg",
  "Dr. Maria Santos": "/images/doctors/d13.jpg",
  "Dr. Miguel Garcia": "/images/doctors/d14.jpg",
  "Dr. Nathan Villanueva": "/images/doctors/d15.jpg",
  "Dr. Nicole Fernandez": "/images/doctors/d16.jpg",
  "Dr. Patricia Ramos": "/images/doctors/d17.jpg",
  "Dr. Rafael Lim": "/images/doctors/d18.jpg",
  "Dr. Samuel Co": "/images/doctors/d19.jpg",
  "Dr. Sofia Mendoza": "/images/doctors/d20.jpg",
});

// Supabase image_url remains authoritative; this exact-name fallback keeps
// profiles visible while a demo record's image_url is still empty.
export function getDoctorPhotoFallback(displayName) {
  const normalizedName = typeof displayName === "string" ? displayName.trim() : "";
  return DOCTOR_PHOTO_FALLBACKS[normalizedName] ?? null;
}
