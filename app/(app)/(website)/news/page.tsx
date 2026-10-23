import type { Metadata } from "next";
import Link from "next/link";

import { SectionTitle } from "@/components/common/SectionTitle";
import { NewsListing } from "@/components/news/NewsListing";
import { healthArticles } from "@/lib/news/articles";

export const metadata: Metadata = {
  title: "Health Tips & News",
  description: "Read health tips and wellness information published by MedWell Medical Hospital.",
};

export default function NewsPage() {
  return (
    <main className="news-page">
      <div className="news-page-container">
      <div className="news-page-heading">
        <SectionTitle
          eyebrow="HEALTH TIPS & NEWS"
          title="Health Tips & News"
          description="Helpful health guidance and the latest medical updates from our experts."
        />
        <Link href="/news" className="news-view-all">View All Articles</Link>
      </div>
      <div id="articles-list"><NewsListing articles={healthArticles} /></div>
      </div>
    </main>
  );
}
