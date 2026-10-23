"use client";

import { useEffect, useState } from "react";

const FALLBACK_IMAGE = "/images/services/medical-placeholder.svg";

export function ServiceImage({
  src,
  alt,
  loading,
}: {
  src: string | null;
  alt: string;
  loading?: "eager" | "lazy";
}) {
  const [imageSrc, setImageSrc] = useState(src || FALLBACK_IMAGE);

  useEffect(() => {
    setImageSrc(src || FALLBACK_IMAGE);
  }, [src]);

  return <img
    src={imageSrc}
    alt={alt}
    loading={loading}
    onError={(event) => {
      if (imageSrc !== FALLBACK_IMAGE) setImageSrc(FALLBACK_IMAGE);
      else event.currentTarget.hidden = true;
    }}
  />;
}
