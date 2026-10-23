import Link from "next/link";

import { AppointmentCTA } from "@/components/appointments/AppointmentCTA";
import { DoctorCarousel } from "@/components/doctors/DoctorCarousel";
import { PartnersCarousel } from "@/components/home/PartnersCarousel";
import { HomePromoCards } from "@/components/home/HomePromoCards";
import { Hero } from "@/components/home/Hero";
import { NewsCard } from "@/components/news/NewsCard";
import { SectionTitle } from "@/components/common/SectionTitle";
import { getPublicContact } from "@/lib/services/public-service";
import { healthArticles } from "@/lib/news/articles";
import { ArrowRight, BookOpen, CalendarCheck, ClipboardList, HeartPulse, PackageSearch, Phone, Stethoscope } from "lucide-react";

const helpItems = [
  { title: "Find a Doctor", text: "Browse published doctor profiles.", href: "/doctors", icon: "doctor" },
  { title: "Book Appointment", text: "Send an appointment request.", href: "/appointment", icon: "appointment" },
  { title: "Pharmacy", text: "Browse listed medical products.", href: "/pharmacy", icon: "pharmacy" },
  { title: "Lab Tests", text: "Explore diagnostic services.", href: "/lab-tests", icon: "laboratory" },
  { title: "Health Packages", text: "View available package information.", href: "/health-packages", icon: "packages" },
];

const healthcareServices = [
  { title: "Pharmacy", text: "Browse medical products currently listed in the hospital catalog.", href: "/pharmacy", image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=85", alt: "Pharmaceutical products", icon: "✚" },
  { title: "Cardiology", text: "Explore the hospital’s current service listings and care information.", href: "/services", image: "https://images.unsplash.com/photo-1530026186672-2cd00ffc50fe?auto=format&fit=crop&w=800&q=85", alt: "Anatomical human heart model", icon: "♡" },
  { title: "Neurology", text: "Browse configured services and contact the hospital for details.", href: "/services", image: "https://images.unsplash.com/photo-1644648479153-2a3dbee76212?auto=format&fit=crop&w=800&q=85", alt: "Human brain on a white background", icon: "⌁" },
  { title: "Pathology Lab", text: "Review diagnostic and laboratory services currently listed.", href: "/lab-tests", image: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=800&q=85", alt: "Laboratory testing equipment", icon: "⌬" },
  { title: "Pediatrics", text: "Browse current service information for patients and families.", href: "/services", image: "https://images.unsplash.com/photo-1632053002928-1919605ee6f7?auto=format&fit=crop&w=800&q=85", alt: "Child healthcare image", icon: "＋" },
];

const verifiedHighlights = [
  { icon: Stethoscope, value: "Doctors", label: "Published profiles" },
  { icon: ClipboardList, value: "Services", label: "Configured listings" },
  { icon: PackageSearch, value: "Products", label: "Online catalog" },
  { icon: CalendarCheck, value: "Appointments", label: "Requests for review" },
  { icon: BookOpen, value: "Patient info", label: "Online resources" },
];

const whyItems = [
  "Browse doctor profiles published in the hospital directory",
  "Explore services currently configured by the hospital",
  "Review medical products listed in the online catalog",
  "Send appointment requests for hospital review",
];

const articles = healthArticles.slice(0, 3);

const homepageCarouselSlides = [
  { src: "/images/carousel/hospital.png", alt: "Hospital care environment" },
  { src: "/images/carousel/emegency.png", alt: "Emergency Department entrance and ambulance", objectPosition: "center 35%" },
  { src: "/images/carousel/p1.jpg", alt: "Hospital corridor and patient beds" },
  { src: "/images/carousel/p2.jpg", alt: "Modern operating room lighting" },
  { src: "/images/carousel/p3.jpg", alt: "Hospital corridor with care staff" },
  { src: "/images/carousel/p4.jpg", alt: "Hospital patient ward" },
  { src: "/images/carousel/p5.jpg", alt: "Medical care and health symbols" },
  { src: "/images/carousel/p6.jpg", alt: "Hospital corridor and wheelchair" },
  { src: "/images/carousel/p7.jpg", alt: "Operating room equipment" },
  { src: "/images/carousel/p8.jpg", alt: "Care team in a surgical room" },
];

export default async function HomePage() {
  const contact = await getPublicContact().catch(() => null);
  return (
    <>
      <Hero
        eyebrow="YOUR HEALTH, OUR PRIORITY"
        title="Better Science.<br />Better <span>Health.</span>"
        description="Find hospital services, browse published doctor profiles, and request an appointment for review by the care team."
        primaryCtaLabel="Explore Services"
        primaryCtaHref="/services"
        secondaryCtaLabel="Find a Doctor"
        secondaryCtaHref="/doctors"
        image="https://images.unsplash.com/photo-1584982751601-97dcc096659c?auto=format&fit=crop&w=1000&q=85"
        imageAlt="Doctor in clinic"
        slides={homepageCarouselSlides}
        floatingCards={[
          { title: "Emergency information", description: "Contact the hospital to confirm availability." },
          { title: "Medical products", description: "Browse catalog listings and confirm availability." },
          { title: "Patient information", description: "Guidance for patients and families." },
        ]}
        quickLinks={helpItems}
      />

      <section className="home-healthcare-section" aria-labelledby="home-healthcare-title">
        <div className="container">
          <header className="home-healthcare-heading">
            <span className="section-eyebrow">Care and services</span>
            <h2 id="home-healthcare-title"><span>Our</span> <em>Healthcare</em> <span>Services</span></h2>
            <p>Comprehensive healthcare solutions for you and your family.</p>
          </header>
          <div className="home-service-grid">
            {healthcareServices.map((service) => (
              <Link className="home-service-card" href={service.href} key={service.title}>
                <div className="home-service-image">
                  <img src={service.image} alt={service.alt} />
                  <span className="home-service-icon" aria-hidden="true">{service.icon}</span>
                </div>
                <div className="home-service-copy">
                  <h3>{service.title}</h3>
                  <p>{service.text}</p>
                  <span className="home-service-arrow" aria-label={`Explore ${service.title}`}><ArrowRight size={17} /></span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="home-highlights-band" aria-label="MedWell online resources">
        <div className="container home-highlights-grid">
          {verifiedHighlights.map(({ icon: Icon, value, label }) => (
            <div className="home-highlight" key={value}>
              <Icon size={25} strokeWidth={1.7} aria-hidden="true" />
              <div><strong>{value}</strong><span>{label}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className="home-why-section">
        <div className="container home-why-grid">
          <div className="home-mission-visual">
            <img src="/images/carousel/hospital.png" alt="Hospital building exterior" />
            <div className="home-mission-card"><span>Our Mission</span><p>To support accessible, patient-centered care through clear information and coordinated healthcare services.</p></div>
          </div>
          <div className="home-why-copy">
            <span className="section-eyebrow">Why choose us</span>
            <h2>Why Choose <em>MedWell</em> Medical Hospital?</h2>
            <p>Find current information about the hospital’s services, published care team, and patient support options.</p>
            <ul>{whyItems.map((item) => <li key={item}><HeartPulse size={17} aria-hidden="true" /><span>{item}</span></li>)}</ul>
            <Link href="/about" className="home-about-link">Learn More About Us <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          <aside className="home-emergency-card">
            <div className="home-emergency-icon"><Phone size={21} aria-hidden="true" /></div>
            <span className="home-emergency-kicker">Hospital contact</span>
            <h2>Need Emergency Help?</h2>
            <p>Contact the hospital to confirm urgent care details and current availability. For an immediate emergency, call your local emergency services.</p>
            {contact?.phone ? <a href={`tel:${contact.phone}`} className="home-emergency-phone"><Phone size={17} aria-hidden="true" />{contact.phone}</a> : <Link href="/contact" className="home-emergency-phone">Contact the hospital <ArrowRight size={16} /></Link>}
          </aside>
        </div>
      </section>

      <section className="doctors-home-section">
        <div className="container">
          <SectionTitle
            eyebrow="MEET OUR DOCTORS"
            title="Meet Our Doctors"
            description="Find experienced healthcare professionals to support your health and well-being."
            centered
          />
          <DoctorCarousel />
        </div>
      </section>

      <HomePromoCards />

      <section className="news-section">
        <div className="container">
          <div className="news-header-row">
            <SectionTitle eyebrow="Health Tips & News" title="Health Tips &amp; News" />
            <Link href="/news" className="text-link">
              View All Articles
            </Link>
          </div>

          <div className="news-grid">
            {articles.map((article) => (
              <NewsCard
                key={article.title}
                {...article}
                href={`/articles/${article.slug}`}
              />
            ))}
          </div>
        </div>
      </section>

      <AppointmentCTA />
      <PartnersCarousel />
    </>
  );
}
