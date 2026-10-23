import Link from "next/link";

type NewsCardProps = {
  category: string;
  title: string;
  date: string;
  image: string;
  imageAlt?: string;
  href: string;
};

export function NewsCard({ category, title, date, image, imageAlt = title, href }: NewsCardProps) {
  return (
    <Link href={href} className="news-card news-card-link" aria-label={`Read ${title}`}>
      <article className="news-preview">
        <div className="news-image-wrap">
          <img src={image} alt={imageAlt} className="news-image" />
        </div>
        <div className="news-content">
          <span className="news-category">{category}</span>
          <h3>{title}</h3>
          <div className="news-meta">
            <time>{date}</time>
            <span className="news-read-more">Read More</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
