import Image from "next/image";
import Link from "next/link";

type DoctorCardProps = {
  name: string;
  specialty: string;
  experience: string;
  availability: string;
  image: string;
  href?: string;
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
  experience,
  availability,
  image,
  href = "/appointment",
}: DoctorCardProps) {
  return (
    <article className="doctor-card">
      <div className="doctor-image-wrap">
        <Image
          src={image}
          alt={`Portrait of ${name}`}
          fill
          className="doctor-image"
          sizes="(max-width: 640px) 100vw, (max-width: 900px) 50vw, (max-width: 1200px) 33vw, 25vw"
          loading="lazy"
        />
        <span className={`doctor-avail-badge ${getAvailClass(availability)}`}>
          {availability}
        </span>
      </div>
      <div className="doctor-content">
        <div className="doctor-card-header">
          <span className="doctor-medical-badge">✚</span>
          <div>
            <h3>{name}</h3>
            <span className="doctor-specialty">{specialty}</span>
          </div>
        </div>
        <p className="doctor-experience">{experience}</p>
        <div className="doctor-actions">
          <Link href="/doctors" className="btn-outline compact">
            View Profile
          </Link>
          <Link href={href} className="btn-primary compact">
            Book
          </Link>
        </div>
      </div>
    </article>
  );
}
