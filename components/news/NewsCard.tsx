import Link from "next/link";

type NewsCardProps = {
  category: string;
  title: string;
  date: string;
  image: string;
  href?: string;
};

export function NewsCard({ category, title, date, image, href = "/news" }: NewsCardProps) {
  return (
    <article className="news-card">
      <div className="news-image-wrap">
        <img src={image} alt={title} className="news-image" />
      </div>
      <div className="news-content">
        <span className="news-category">{category}</span>
        <h3>{title}</h3>
        <div className="news-meta">
          <span>{date}</span>
          <Link href={href}>Read More</Link>
        </div>
      </div>
    </article>
  );
}
