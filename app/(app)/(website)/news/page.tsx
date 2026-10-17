import type { Metadata } from "next";

import { NewsCard } from "@/components/news/NewsCard";
import { SectionTitle } from "@/components/common/SectionTitle";

export const metadata: Metadata = {
  title: "Health Tips & News",
  description: "Read the latest health tips, wellness guidance, and industry updates from MediWell Pharma.",
};

const articles = [
  {
    category: "Health Tips",
    title: "Importance of Regular Health Checkups",
    date: "May 02, 2024",
    image: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=800&q=80",
  },
  {
    category: "Nutrition",
    title: "Boost Your Immunity Naturally",
    date: "May 01, 2024",
    image: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=800&q=80",
  },
  {
    category: "Pharma News",
    title: "Advances in Modern Medicine",
    date: "Apr 30, 2024",
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80",
  },
  {
    category: "Wellness",
    title: "Managing Stress for Better Long-Term Health",
    date: "Apr 28, 2024",
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80",
  },
  {
    category: "Medical Research",
    title: "Understanding Preventive Screening Benefits",
    date: "Apr 16, 2024",
    image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=800&q=80",
  },
  {
    category: "Health Tips",
    title: "Healthy Daily Habits That Truly Last",
    date: "Apr 10, 2024",
    image: "https://images.unsplash.com/photo-1541534401786-8ac227113fcd?auto=format&fit=crop&w=800&q=80",
  },
];

export default function NewsPage() {
  return (
    <div className="container page-shell">
      <div className="page-banner-compact">
        <SectionTitle
          eyebrow="Insights & updates"
          title="Health Tips & News"
          description="Helpful health guidance and the latest medical updates from our experts."
        />
      </div>

      <div className="catalog-controls">
        <input type="search" placeholder="Search articles" aria-label="Search articles" />
        <div className="category-filter">
          <button type="button" className="filter-chip active">Health Tips</button>
          <button type="button" className="filter-chip">Nutrition</button>
          <button type="button" className="filter-chip">Pharma News</button>
          <button type="button" className="filter-chip">Wellness</button>
          <button type="button" className="filter-chip">Medical Research</button>
        </div>
      </div>

      <div className="news-grid">
        {articles.map((article) => (
          <NewsCard
            key={article.title}
            category={article.category}
            title={article.title}
            date={article.date}
            image={article.image}
            href="/news"
          />
        ))}
      </div>
    </div>
  );
}
