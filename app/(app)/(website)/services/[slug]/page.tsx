import Link from "next/link";
import { Activity, ArrowLeft, BadgeCheck, Beaker, CalendarDays, CheckCircle2, Clock3, HeartPulse, Mail, MapPin, Phone, ScanLine, Stethoscope, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { getPublicContact, getPublicServiceBySlug, getRelatedDoctors } from "@/lib/services/public-service";

function RichDescription({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return <div className="service-rich-text">{lines.map((line, index) => {
    const isList = /^[-*]\s+/.test(line);
    const content = isList ? line.replace(/^[-*]\s+/, "") : line;
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, partIndex) => part.startsWith("**") && part.endsWith("**") ? <strong key={partIndex}>{part.slice(2, -2)}</strong> : part);
    return isList ? <p className="service-rich-bullet" key={index}><CheckCircle2 size={17} />{rendered}</p> : <p key={index}>{rendered}</p>;
  })}</div>;
}

const procedureIcons = [Activity, ScanLine, Beaker, HeartPulse];

export default async function ServiceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = await getPublicServiceBySlug(slug);
  if (!service) notFound();
  const [doctors, contact] = await Promise.all([
    getRelatedDoctors(service.name).catch(() => []),
    getPublicContact().catch(() => ({ phone: "+1 234 567 8900", email: "info@mediwell.com", address: null, operating_hours: null })),
  ]);
  const heroImage = service.image_url && !service.image_url.includes("medical-placeholder.svg") ? service.image_url : null;

  return <article className="service-detail-page"><div className="container service-detail-container">
    <Link href="/services" className="service-detail-back"><ArrowLeft size={18} /> All services</Link>
    <section className="service-detail-hero">
      <div className={heroImage ? "service-detail-image" : "service-detail-image service-detail-image-fallback"}>
        {heroImage ? <img src={heroImage} alt={service.name} /> : <div className="service-hero-symbol"><Stethoscope size={76} strokeWidth={1.2} /><span>{service.name}</span></div>}
      </div>
      <div className="service-detail-intro">
        <div className="service-hero-badges"><span className="service-detail-eyebrow"><Stethoscope size={16} /> MediWell healthcare</span><span className="service-status"><BadgeCheck size={15} /> Available</span><span className="service-type-badge">Hospital Service</span><span className="service-type-badge">Specialist Care</span></div>
        <h1>{service.name}</h1><p className="service-detail-short">{service.short_description || service.description}</p>
        <div className="service-detail-actions"><Link href={`/appointment?service=${encodeURIComponent(service.slug)}`} className="btn-primary"><CalendarDays size={18} /> Book Appointment</Link><Link href="/contact" className="btn-outline"><Phone size={18} /> Contact Us</Link></div>
      </div>
    </section>

    <section className="service-detail-panel service-about-panel"><div className="service-panel-heading"><span><Stethoscope size={19} /></span><div><small>CARE OVERVIEW</small><h2>About This Service</h2></div></div><RichDescription text={service.description || service.short_description || service.name} /></section>
    <div className="service-detail-content-grid"><div className="service-detail-main">
      {service.benefits?.length ? <section className="service-detail-panel"><div className="service-panel-heading"><span><HeartPulse size={19} /></span><div><small>WHY CHOOSE THIS SERVICE</small><h2>Patient Benefits</h2></div></div><ul className="service-benefit-grid">{service.benefits.map((item) => <li key={item}><CheckCircle2 size={18} /><span>{item}</span></li>)}</ul></section> : null}
      {service.treatments?.length ? <section className="service-detail-panel"><div className="service-panel-heading"><span><Activity size={19} /></span><div><small>AVAILABLE CARE</small><h2>Treatments &amp; Procedures</h2></div></div><div className="service-procedure-grid">{service.treatments.map((item, index) => { const Icon = procedureIcons[index % procedureIcons.length]; return <div className="service-procedure-card" key={item}><span><Icon size={20} /></span><strong>{item}</strong></div>; })}</div></section> : null}
      {service.faqs?.length ? <section className="service-detail-panel"><div className="service-panel-heading"><span><CheckCircle2 size={19} /></span><div><small>HELPFUL INFORMATION</small><h2>Frequently Asked Questions</h2></div></div><div className="service-faq-list">{service.faqs.map((faq) => <details className="service-faq-item" key={faq.question}><summary>{faq.question}<span>+</span></summary><p>{faq.answer}</p></details>)}</div></section> : null}
    </div>
    <aside className="service-detail-contact"><div className="service-contact-heading"><span><Phone size={19} /></span><div><small>WE’RE HERE TO HELP</small><h2>Contact MediWell</h2></div></div>
      <a href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`} className="service-contact-row"><span><Phone size={17} /></span><div><small>Phone</small><strong>{contact.phone}</strong></div></a>
      <a href={`mailto:${contact.email}`} className="service-contact-row"><span><Mail size={17} /></span><div><small>Email</small><strong>{contact.email}</strong></div></a>
      {contact.address ? <div className="service-contact-row"><span><MapPin size={17} /></span><div><small>Hospital Address</small><strong>{contact.address}</strong></div></div> : null}
      {contact.operating_hours ? <div className="service-contact-row"><span><Clock3 size={17} /></span><div><small>Operating Hours</small><strong>{contact.operating_hours}</strong></div></div> : null}
      <Link href={`/appointment?service=${encodeURIComponent(service.slug)}`} className="btn-primary service-contact-appointment"><CalendarDays size={18} /> Book Appointment</Link>
    </aside></div>

    <section className="service-related-doctors"><div className="service-detail-section-heading"><span>MEET YOUR CARE TEAM</span><h2>Related Specialists</h2><p>Doctors assigned to {service.name}.</p></div>
      {doctors.length ? <div className="service-doctor-grid">{doctors.map((doctor) => <article className="service-doctor-card" key={doctor.id}><div className="service-doctor-photo">{doctor.photo_url ? <img src={doctor.photo_url} alt={`Dr. ${doctor.first_name} ${doctor.last_name}`} /> : <UserRound size={34} />}</div><div className="service-doctor-info"><h3>Dr. {doctor.first_name} {doctor.last_name}</h3><p>{doctor.specialization}</p>{doctor.experience ? <span>{doctor.experience}</span> : null}{doctor.availability_schedule ? <span>{doctor.availability_schedule}</span> : null}<Link href="/doctors" className="service-doctor-profile">View Profile <ArrowLeft size={15} /></Link></div></article>)}</div> : <div className="service-doctor-empty"><Stethoscope size={23} /><p>No specialists assigned yet.</p></div>}
    </section>

    <section className="service-appointment-band"><div><span>YOUR HEALTH, OUR PRIORITY</span><h2>Ready to take the next step?</h2><p>Request an appointment and our care team will help coordinate the right service for you.</p></div><Link href={`/appointment?service=${encodeURIComponent(service.slug)}`} className="btn-primary"><CalendarDays size={18} /> Book Appointment</Link></section>
  </div></article>;
}
