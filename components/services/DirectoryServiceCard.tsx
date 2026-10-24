import Link from "next/link";
import { ArrowRight, Stethoscope } from "lucide-react";
import { ServiceImage } from "./ServiceImage";

export type DirectoryService = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  image_url: string | null;
  section: "clinical_departments" | "services_facilities";
};

export function DirectoryServiceCard({ service, healthcare = false }: { service: DirectoryService; healthcare?: boolean }) {
  const Heading = healthcare ? "h3" : "h2";
  return <article className={`services-directory-card${healthcare ? " healthcare-service-card" : service.section === "services_facilities" ? " services-facilities-card" : ""}`}>
    <div className="services-directory-image">
      <ServiceImage src={service.image_url} slug={service.slug} alt={service.name} loading="lazy"
        sizes={healthcare ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw" : undefined} />
    </div>
    <div className="services-directory-card-body">
      <Heading>{service.section === "services_facilities" && !healthcare ? <Stethoscope size={17} aria-hidden="true" /> : <span className="clinical-department-card-icon"><Stethoscope size={16} aria-hidden="true" /></span>}{service.name}</Heading>
      <p>{service.short_description?.trim() || service.description?.trim() || "Service information is available on the details page."}</p>
      <Link className="services-directory-details" href={`/services/${encodeURIComponent(service.slug)}?section=${service.section}`}>
        View Details <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  </article>;
}
