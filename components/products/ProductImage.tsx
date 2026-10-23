"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Package } from "lucide-react";

export function ProductImage({ src, alt, className, fallback }: {
  src?: string | null;
  alt: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  useEffect(() => setFailedSource(null), [src]);

  if (!src || failedSource === src) return fallback ?? <ProductImageFallback />;
  return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setFailedSource(src)} />;
}

export function ProductImageFallback() {
  return <div className="product-image-placeholder" role="img" aria-label="Product image unavailable"><Package size={38} strokeWidth={1.5} aria-hidden="true" /><span>Image unavailable</span></div>;
}
