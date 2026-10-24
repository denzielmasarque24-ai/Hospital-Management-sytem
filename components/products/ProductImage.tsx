"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
import { getProductImageSources } from "@/lib/products/product-images";

export function ProductImage({ src, alt, className, fallback, slug, fill = false }: {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
  slug?: string;
  fill?: boolean;
}) {
  const sources = getProductImageSources(alt, src, slug);
  return <ProductImageContent key={JSON.stringify(sources)} sources={sources} alt={alt} className={className} fallback={fallback} fill={fill} />;
}

function ProductImageContent({ sources, alt, className, fallback, fill }: {
  sources: string[]; alt: string; className?: string; fallback?: ReactNode; fill: boolean;
}) {
  const [attempt, setAttempt] = useState({ index: 0, direct: false });
  const { index, direct } = attempt;
  const src = sources[index];
  if (!src) return fallback ?? <ProductImageFallback />;
  const local = src.startsWith("/") && !src.startsWith("//");
  return <Image key={`${index}:${direct}`} src={src} alt={alt} className={className} loading="lazy"
    {...(fill ? { fill: true } : { width: 640, height: 640 })}
    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
    unoptimized={direct || /^(https?:|blob:)/.test(src)} style={{ objectFit: "contain" }}
    onError={() => setAttempt((current) => {
      // Ignore duplicate or delayed errors from a previous attempt. Otherwise
      // two errors for an upload can skip its valid local fallback entirely.
      if (current.index !== index || current.direct !== direct) return current;
      // Optimizer errors do not mean the original public asset is unavailable.
      if (local && !direct) return { index, direct: true };
      return { index: index + 1, direct: false };
    })} />;
}

export function ProductImageFallback() {
  return <div className="product-image-placeholder" role="img" aria-label="Product image unavailable"><Package size={38} strokeWidth={1.5} aria-hidden="true" /><span>Image unavailable</span></div>;
}
