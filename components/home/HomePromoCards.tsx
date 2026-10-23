import Image from "next/image";
import Link from "next/link";

const promos = [
  {
    eyebrow: "LATEST NEWS",
    title: <>LATEST NEWS<br />&amp; EVENTS</>,
    description: "Exclusive Healthcare Promos and Offers for added value.",
    href: "/news",
    image: "/images/p2.png",
    imageAlt: "Smiling woman doctor in a medical coat",
    imageClass: "home-promo-image-news",
    label: "Latest News & Events",
  },
  {
    eyebrow: "PATIENT RESOURCES",
    title: <>PATIENT &amp; GUEST<br />GUIDELINES</>,
    description: "Review guidelines for a safe and comfortable visit.",
    href: "/patient-guide/guidelines",
    image: "/images/health.png",
    imageAlt: "Smiling woman doctor holding a tablet in a hospital",
    imageClass: "home-promo-image-guidelines",
    label: "Patient & Guest Guidelines",
  },
];

export function HomePromoCards() {
  return (
    <section className="home-promo-section" aria-label="News and patient information">
      <div className="container">
        <div className="home-promo-grid">
          {promos.map((promo) => (
            <article className="home-promo-card" key={promo.href}>
              <div className="home-promo-copy">
                <span className="home-promo-eyebrow">{promo.eyebrow}</span>
                <h2>{promo.title}</h2>
                <p>{promo.description}</p>
                <Link className="home-promo-button" href={promo.href} aria-label={`${promo.label}: click here`}>
                  CLICK HERE
                </Link>
              </div>
              <div className={`home-promo-image ${promo.imageClass}`}>
                <Image src={promo.image} alt={promo.imageAlt} fill sizes="(max-width: 760px) 36vw, (max-width: 1200px) 22vw, 280px" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
