import Link from "next/link";
import { ArrowLeft, ArrowRight, BadgeCheck, CalendarDays, CheckCircle2, Clock3, HeartPulse, Mail, MapPin, Phone, Stethoscope } from "lucide-react";
import { notFound } from "next/navigation";
import ServiceDetailTabs from "@/components/services/ServiceDetailTabs";
import { ServiceImage } from "@/components/services/ServiceImage";
import { getPublicContact, getPublicServiceBySlug, getRelatedPublicServices } from "@/lib/services/public-service";

const hospitalCommitment = "To support accessible, patient-centered care through clear information and coordinated healthcare services.";

export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const requestedSection = Array.isArray(search.section) ? search.section[0] : search.section;
  const sectionFilter = requestedSection === "clinical_departments" || requestedSection === "services_facilities"
    ? requestedSection
    : "services_facilities";
  const service = await getPublicServiceBySlug(slug, sectionFilter);
  if (!service) notFound();

  const [contact, relatedServices] = await Promise.all([
    getPublicContact().catch(() => null),
    getRelatedPublicServices(service.slug, "services_facilities", 4).catch(() => []),
  ]);
  const listHref = service.section === "clinical_departments" ? "/clinical-departments" : "/services";
  const listLabel = service.section === "clinical_departments" ? "Clinical Departments" : "Services & Facilities";
  const overview = service.description || service.short_description || service.name;

  return <article className="service-detail-page">
    <div className="container service-detail-container">
      <Link href={listHref} className="service-detail-back"><ArrowLeft size={18} aria-hidden="true" /> Back to {listLabel}</Link>

      <section className="service-detail-hero" aria-labelledby="service-detail-title">
        <div className={`service-detail-image${service.image_url ? "" : " service-detail-image-fallback"}`}>
          {service.image_url
            ? <ServiceImage src={service.image_url} alt={service.name} loading="eager" />
            : <div className="service-detail-placeholder" aria-label="Service image unavailable"><span><Stethoscope size={42} aria-hidden="true" /></span></div>}
        </div>
        <div className="service-detail-intro">
          <div className="service-hero-badges">
            <span className="service-detail-eyebrow"><Stethoscope size={16} aria-hidden="true" /> MedWell Medical Hospital</span>
            <span className="service-status"><BadgeCheck size={15} aria-hidden="true" /> Listed Service</span>
          </div>
          <h1 id="service-detail-title">{service.name}</h1>
          <p className="service-detail-short">{service.short_description || service.description || "Service information is available from the hospital."}</p>
          <div className="service-detail-actions">
            <Link href={`/appointment?service=${encodeURIComponent(service.slug)}`} className="btn-primary"><CalendarDays size={18} aria-hidden="true" /> Book an Appointment</Link>
            <Link href="/contact" className="btn-outline"><Phone size={18} aria-hidden="true" /> Contact Us</Link>
          </div>
        </div>
      </section>

      <div className="service-detail-content-grid">
        <div className="service-detail-main">
          <ServiceDetailTabs
            key={service.slug}
            overview={overview}
            treatments={service.treatments ?? []}
            benefits={service.benefits ?? []}
            faqs={service.faqs ?? []}
          />
        </div>

        <aside className="service-detail-aside">
          <section className="service-detail-contact">
            <div className="service-contact-heading"><span><Phone size={19} aria-hidden="true" /></span><div><small>WE'RE HERE TO HELP</small><h2>Contact the Hospital</h2></div></div>
            <p className="service-contact-intro">Contact our team for assistance.</p>
            {contact?.phone ? <a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`} className="service-contact-row"><span><Phone size={17} aria-hidden="true" /></span><div><small>Phone</small><strong>{contact.phone}</strong></div></a> : null}
            {contact?.email ? <a href={`mailto:${contact.email}`} className="service-contact-row"><span><Mail size={17} aria-hidden="true" /></span><div><small>Email</small><strong>{contact.email}</strong></div></a> : null}
            {contact?.address ? <div className="service-contact-row"><span><MapPin size={17} aria-hidden="true" /></span><div><small>Hospital Address</small><strong>{contact.address}</strong></div></div> : null}
            {contact?.operating_hours ? <div className="service-contact-row"><span><Clock3 size={17} aria-hidden="true" /></span><div><small>Operating Hours</small><strong>{contact.operating_hours}</strong></div></div> : null}
            <Link href="/contact" className="service-contact-link">Contact Us <ArrowRight size={16} aria-hidden="true" /></Link>
          </section>

        </aside>
      </div>

      <section className="service-commitment-card" aria-labelledby="service-commitment-title">
        <span className="service-commitment-icon"><HeartPulse size={21} aria-hidden="true" /></span>
        <div className="service-commitment-heading"><small>OUR COMMITMENT</small><h2 id="service-commitment-title">Care with clarity and purpose.</h2></div>
        <p>{hospitalCommitment}</p>
      </section>

      {relatedServices.length ? <section className="service-related-services" aria-labelledby="related-services-title">
        <div className="service-related-heading">
          <div><span>EXPLORE MORE</span><h2 id="related-services-title">Related Services</h2></div>
          <Link href={listHref} className="service-view-all">View All {listLabel} <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="service-related-grid">
          {relatedServices.map((related) => {
            const relatedImage = related.image_url && !related.image_url.includes("medical-placeholder.svg") ? related.image_url : null;
            return <Link href={`/services/${encodeURIComponent(related.slug)}?section=${related.section}`} className="service-related-card" key={related.slug}>
              <div className={relatedImage ? "service-related-image" : "service-related-image service-related-image-fallback"}>
                {relatedImage ? <ServiceImage src={relatedImage} alt={related.name} loading="lazy" /> : <span className="service-related-placeholder"><Stethoscope size={23} aria-hidden="true" /></span>}
              </div>
              <div className="service-related-card-body">
                <h3>{related.name}</h3>
                <p>{related.short_description || related.description || "View current service information."}</p>
                <span className="service-related-arrow" aria-label={`View ${related.name}`}><ArrowRight size={17} aria-hidden="true" /></span>
              </div>
            </Link>;
          })}
        </div>
      </section> : null}

      <section className="service-appointment-band">
        <div><span>MEDWELL MEDICAL HOSPITAL</span><h2>Need help with this service?</h2><p>Contact the hospital or request an appointment for assistance.</p></div>
        <Link href={`/appointment?service=${encodeURIComponent(service.slug)}`} className="btn-primary"><CalendarDays size={18} aria-hidden="true" /> Book an Appointment</Link>
      </section>
    </div>
  </article>;
}
