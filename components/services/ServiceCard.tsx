import Link from "next/link";

type ServiceCardProps = {
  title: string;
  description: string;
  image: string;
  href?: string;
};

export function ServiceCard({ title, description, image, href = "/services" }: ServiceCardProps) {
  return (
    <Link href={href} className="service-card">
      <div className="service-image">
        <img src={image} alt={title} />
      </div>
      <div className="service-body">
        <h3>{title}</h3>
        <p>{description}</p>
        <span className="arrow-button" aria-label={`Learn more about ${title}`}>
          →
        </span>
      </div>
    </Link>
  );
}
