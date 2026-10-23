import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { healthArticles } from "@/lib/news/articles";

function getReadingTime(article: (typeof healthArticles)[number]) {
  const wordCount = [article.title, ...article.content.flatMap((section) => [section.heading, ...section.paragraphs])]
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

type ArticlePageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return healthArticles.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = healthArticles.find((item) => item.slug === slug);
  return article
    ? { title: article.title, description: article.content[0]?.paragraphs[0] }
    : { title: "Article not found" };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = healthArticles.find((item) => item.slug === slug);
  if (!article) notFound();

  return (
    <main className="article-detail-page">
      <div className="article-detail-container">
      <Link href="/news" className="article-back-link">← All Health Articles</Link>
      <article className="article-detail">
        <header className="article-detail-header">
          <span className="article-category-badge">{article.category}</span>
          <h1>{article.title}</h1>
          <div className="article-byline"><time>{article.date}</time><span aria-hidden="true">·</span><span>{getReadingTime(article)} min read</span></div>
        </header>
        <img className="article-detail-image" src={article.image} alt={article.imageAlt} />
        <div className="article-detail-content">
          {article.content.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          <p className="article-medical-note">This article is for general education and does not replace individualized advice from a qualified healthcare professional.</p>
        </div>
      </article>
      <Link href="/news" className="article-back-link article-bottom-link">← Back to Articles</Link>
      </div>
    </main>
  );
}
