"use client";

import { useState } from "react";
import Image from "next/image";
import { getServiceImageSources } from "@/lib/services/service-images.mjs";

export function ServiceImage({
  src,
  slug = "",
  alt,
  loading,
  sizes = "(max-width: 680px) 100vw, (max-width: 1024px) 50vw, 25vw",
}: {
  src: string | null;
  slug?: string;
  alt: string;
  loading?: "eager" | "lazy";
  sizes?: string;
}) {
  const sources = getServiceImageSources(slug, src);
  return <ImageWithFallback key={JSON.stringify(sources)} sources={sources} alt={alt} loading={loading} sizes={sizes} />;
}

function ImageWithFallback({ sources, alt, loading, sizes }: { sources: string[]; alt: string; loading?: "eager" | "lazy"; sizes: string }) {
  const [index, setIndex] = useState(0);
  const src = sources[index];
  return <Image src={src} alt={alt} fill sizes={sizes}
    loading={loading} unoptimized={/^https?:\/\//.test(src)}
    style={{ objectFit: "cover", objectPosition: "center" }}
    onError={() => setIndex((current) => Math.min(current + 1, sources.length - 1))} />;
}
