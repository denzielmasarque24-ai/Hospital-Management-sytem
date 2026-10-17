import Link from "next/link";

import { HeroCarousel } from "@/components/home/HeroCarousel";

export type HeroFloatingCard = {
  title: string;
  description: string;
};

type HeroSlide = {
  src: string;
  alt: string;
};

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
  trustValue = "100K+",
  trustLabel = "Patients Trust Us",
  slides,
}: HeroProps) {
  const heroSlides = slides ?? [
    { src: image, alt: imageAlt },
    {
      src: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80",
      alt: "Doctor consulting with patient",
    },
    {
      src: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80",
      alt: "Modern hospital",
    },
    {
      src: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80",
      alt: "Pharmacist preparing medicine",
    },
    {
      src: "https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=1200&q=80",
      alt: "Medical laboratory",
    },
  ];

  return (
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-content">
          <span className="eyebrow">{eyebrow}</span>
          <h1 dangerouslySetInnerHTML={{ __html: title }} />
          <p>{description}</p>

          <div className="hero-buttons">
            <Link href={primaryCtaHref} className="btn-primary">
              {primaryCtaLabel} <span>→</span>
            </Link>
            {secondaryCtaLabel && secondaryCtaHref ? (
              <Link href={secondaryCtaHref} className="btn-outline">
                {secondaryCtaLabel}
              </Link>
            ) : null}
          </div>

          <div className="patients">
            <div className="avatars" aria-label="Patient satisfaction">
              <span className="avatar">👩🏻</span>
              <span className="avatar">👨🏻</span>
              <span className="avatar">👩🏼</span>
              <span className="avatar">👨🏽</span>
            </div>
            <div>
              <strong>{trustValue}</strong>
              <span>{trustLabel}</span>
            </div>
          </div>
        </div>

        <div className="hero-image-wrapper">
          <div className="hero-circle" />
          <HeroCarousel slides={heroSlides} />

          {floatingCards.map((card, index) => (
            <div key={`${card.title}-${index}`} className={`floating-card card-${index + 1}`}>
              <div className="floating-icon">{index === 0 ? "✚" : index === 1 ? "✓" : "★"}</div>
              <div>
                <strong>{card.title}</strong>
                <span>{card.description}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
