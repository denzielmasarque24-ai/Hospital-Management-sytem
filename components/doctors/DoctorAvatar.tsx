"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import "./doctor-avatar.css";

export function DoctorAvatar({ image, fallbackImage, name, className = "directory-avatar", fill = false, size = 56, showFallbackIcon = true }: { image?: string | null; fallbackImage?: string | null; name: string; className?: string; fill?: boolean; size?: number; showFallbackIcon?: boolean }) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const source = [image?.trim(), fallbackImage?.trim()].find(value => value && !failedImages.includes(value));
  return <span className={className}>{source ? <img src={source} alt={`Portrait of ${name}`} loading="lazy" onError={() => setFailedImages(current => [...current, source])}/> : <span className="doctor-avatar-fallback" role={showFallbackIcon ? "img" : undefined} aria-label={showFallbackIcon ? `Profile photo unavailable for ${name}` : undefined} aria-hidden={showFallbackIcon ? undefined : true}>{showFallbackIcon && <UserRound size={size >= 160 ? 64 : 24} strokeWidth={1.5} aria-hidden="true"/>}</span>}</span>;
}
