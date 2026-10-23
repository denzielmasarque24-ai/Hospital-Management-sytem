import Image from "next/image";
import Link from "next/link";
import { Stethoscope, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type DoctorCardProps = {
  name: string;
  specialty: string;
  department?: string | null;
  experience: string;
  availability: string;
  image: string | null;
  title?: string;
  biography?: string;
  isDemo?: boolean;
  href?: string;
  directoryVariant?: boolean;
};

const availabilityColor: Record<string, string> = {
  today: "avail-green",
  week: "avail-blue",
  tomorrow: "avail-blue",
  monday: "avail-gray",
  friday: "avail-gray",
  wednesday: "avail-gray",
};

function getAvailClass(availability: string) {
  const lower = availability.toLowerCase();
  for (const [key, cls] of Object.entries(availabilityColor)) {
    if (lower.includes(key)) return cls;
  }
  return "avail-gray";
}

export function DoctorCard({
  name,
  specialty,
  department,
  experience,
  availability,
  image,
  title,
  biography,
  isDemo = false,
  href = "/doctors",
  directoryVariant = false,
}: DoctorCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [image]);

  return (
    <article className={`doctor-card${directoryVariant ? " doctor-directory-card" : ""}`}>
      <div className="doctor-image-wrap">
        {image && !imageFailed ? <Image
          src={image}
          alt={`Portrait of ${name}`}
          fill
          unoptimized
          className="doctor-image"
          sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, (max-width: 1200px) 33vw, 25vw"
          loading="lazy"
          onError={() => setImageFailed(true)}
        /> : <div className="doctor-image doctor-image-placeholder" role="img" aria-label={`Profile photo unavailable for ${name}`}><UserRound size={52} strokeWidth={1.35} aria-hidden="true" /></div>}
        {availability ? <span className={`doctor-avail-badge ${getAvailClass(availability)}`}>
          {availability}
        </span> : null}
        {isDemo ? <span className="doctor-demo-label doctor-demo-label-overlay">Demo Profile — Fictional Doctor</span> : null}
      </div>
      <div className="doctor-content">
        <div className="doctor-card-header">
          <span className="doctor-medical-badge"><Stethoscope size={17} aria-hidden="true" /></span>
          <div>
            <h3>{name}</h3>
            {title ? <span className="doctor-professional-title">{title}</span> : null}
            <span className="doctor-specialty">{specialty}</span>
            {directoryVariant ? <span className="doctor-department">Department: {department || "Not listed"}</span> : null}
          </div>
        </div>
        {experience ? <p className="doctor-experience">{experience}</p> : null}
        {biography ? <p className="doctor-biography">{biography}</p> : null}
        <div className="doctor-actions">
          <Link href={href} className="btn-outline compact">
            View Profile
          </Link>
          <Link href="/appointment" className="btn-primary compact" aria-label={`Book an appointment with ${name}`}>
            {directoryVariant ? "Book Appointment" : "Book"}
          </Link>
        </div>
      </div>
    </article>
  );
}
