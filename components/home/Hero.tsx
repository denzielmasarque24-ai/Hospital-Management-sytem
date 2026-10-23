import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, FlaskConical, HeartHandshake, Hospital, PackageCheck, Pill, Stethoscope } from "lucide-react";

import { HeroCarousel } from "@/components/home/HeroCarousel";

export type HeroFloatingCard = { title: string; description: string };
export type HeroQuickLink = { title: string; text: string; href: string; icon: string };
type HeroSlide = { src: string; alt: string };
type HeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  image: string;
  imageAlt: string;
  floatingCards?: HeroFloatingCard[];
  trustValue?: string;
  trustLabel?: string;
  slides?: HeroSlide[];
  quickLinks?: HeroQuickLink[];
};

export function Hero({
  eyebrow,
  title,
  description,
  primaryCtaLabel,
  primaryCtaHref,
  secondaryCtaLabel,
  secondaryCtaHref,
  image,
  imageAlt,
  floatingCards = [],
  trustValue = "Patient-first",
  trustLabel = "care information",
  slides,
  quickLinks = [],
}: HeroProps) {
  const heroSlides = slides ?? [
    { src: image, alt: imageAlt },
    { src: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80", alt: "Doctor consulting with patient" },
    { src: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80", alt: "Modern hospital" },
    { src: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80", alt: "Hospital pharmacy professional preparing medicine" },
    { src: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80", alt: "Medical laboratory" },
  ];
  const cardIcons = [Clock3, Pill, HeartHandshake];
  const shortcutIcons = { doctor: Stethoscope, appointment: CalendarDays, pharmacy: Pill, laboratory: FlaskConical, packages: PackageCheck };

  return (
    <section className="hero">
      <div className="hero-background"><HeroCarousel slides={heroSlides} /></div>
      <div className="container hero-grid">
        <div className="hero-content">
          <span className="eyebrow">{eyebrow}</span>
          <h1 dangerouslySetInnerHTML={{ __html: title }} />
          <p>{description}</p>
          <div className="hero-buttons">
            <Link href={primaryCtaHref} className="btn-primary hero-primary-cta">
              <><span className="hero-primary-label">{primaryCtaLabel || "Explore Services"}</span><span aria-hidden="true">→</span></>
            </Link>
            {secondaryCtaLabel && secondaryCtaHref && <Link href={secondaryCtaHref} className="btn-outline">{secondaryCtaLabel}</Link>}
          </div>
          <div className="patients">
            <span className="hero-trust-icon" aria-hidden="true"><Hospital size={20} /></span>
            <div><strong>{trustValue}</strong><span>{trustLabel}</span></div>
          </div>
        </div>
        <div className="hero-visual" aria-label="MedWell service information">
          <div className="hero-floating-cards">
            {floatingCards.map((card, index) => {
              const Icon = cardIcons[index % cardIcons.length];
              return <div key={`${card.title}-${index}`} className={`floating-card card-${index + 1}`}>
                <div className="floating-icon"><Icon size={20} aria-hidden="true" /></div>
                <div><strong>{card.title}</strong><span>{card.description}</span></div>
              </div>;
            })}
          </div>
        </div>
      </div>
      {quickLinks.length > 0 && <div className="hero-shortcuts container">
        <h2>How Can We Help You?</h2>
        <div className="hero-shortcuts-grid">
          {quickLinks.map((item) => {
            const Icon = shortcutIcons[item.icon as keyof typeof shortcutIcons] ?? Hospital;
            return <Link key={item.title} href={item.href} className="hero-shortcut">
              <span className="hero-shortcut-icon"><Icon size={20} aria-hidden="true" /></span>
              <span className="hero-shortcut-copy"><strong>{item.title}</strong><small>{item.text}</small></span>
              <ArrowRight className="hero-shortcut-arrow" size={16} aria-hidden="true" />
            </Link>;
          })}
        </div>
      </div>}
    </section>
  );
}
