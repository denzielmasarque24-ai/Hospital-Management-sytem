"use client";

import { useMemo, useState } from "react";
import { NewsCard } from "@/components/news/NewsCard";
import type { HealthArticle } from "@/lib/news/articles";

const categories = ["All", "Nutrition", "Hospital Updates", "Wellness", "Medical Research", "Health Awareness"];

export function NewsListing({ articles }: { articles: HealthArticle[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const visibleArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesCategory = category === "All" || article.category === category;
      const searchableText = [article.title, article.category, ...article.keywords].join(" ").toLowerCase();
      return matchesCategory && (!normalizedQuery || searchableText.includes(normalizedQuery));
    });
  }, [articles, category, query]);

  return (
    <>
      <div className="catalog-controls">
        <input
          type="search"
          placeholder="Search articles"
          aria-label="Search articles"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="category-filter" aria-label="Filter articles by category">
          {categories.map((item) => (
            <button
              type="button"
              key={item}
              className={`filter-chip${category === item ? " active" : ""}`}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {visibleArticles.length ? (
        <div className="news-grid">
          {visibleArticles.map((article) => (
            <NewsCard
              key={article.slug}
              {...article}
              href={`/articles/${article.slug}`}
            />
          ))}
        </div>
      ) : (
        <p className="empty-state" role="status">No articles match your search. Try another title, topic, or category.</p>
      )}
    </>
  );
}
