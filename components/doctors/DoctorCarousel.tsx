"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { DoctorCard } from "./DoctorCard";
import { usePublicDoctors } from "./usePublicDoctors";

function useSlidesPerView() {
  const [perView, setPerView] = useState(4);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 640) setPerView(1);
      else if (w < 900) setPerView(2);
      else if (w < 1200) setPerView(3);
      else setPerView(4);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return perView;
}

export function DoctorCarousel() {
  const perView = useSlidesPerView();
  const { doctors, loading, error, retry } = usePublicDoctors();
  const total = doctors.length;
  const maxIndex = Math.max(0, total - perView);
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const isAnimating = useRef(false);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, total - perView)));
  }, [perView, total]);

  const go = useCallback((next: number) => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    setIndex(Math.max(0, Math.min(next, maxIndex)));
    setTimeout(() => { isAnimating.current = false; }, 400);
  }, [maxIndex]);

  const prev = useCallback(() => go(index - 1), [go, index]);
  const next = useCallback(() => go(index + 1), [go, index]);

  useEffect(() => {
    if (isPaused || maxIndex === 0) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i >= maxIndex ? 0 : i + 1));
    }, 4500);
    return () => window.clearInterval(id);
  }, [isPaused, maxIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
    touchStartX.current = null;
  };

  if (loading) return <div className="doctor-state-grid" role="status" aria-label="Loading doctor profiles">
    {Array.from({ length: Math.max(2, Math.min(perView, 4)) }).map((_, i) => <div className="doctor-loading-card" key={i}><span className="doctor-loading-photo" /><span className="doctor-loading-line" /><span className="doctor-loading-line short" /><span className="doctor-loading-button" /></div>)}
  </div>;
  if (error) return <div className="doctor-state-card doctor-state-error" role="alert"><span className="doctor-state-icon">!</span><div><h3>Doctor profiles are temporarily unavailable</h3><p>Please try again. If the problem continues, contact the hospital.</p></div><button type="button" onClick={retry}>Try Again</button></div>;
  if (total === 0) return <div className="doctor-state-card" role="status"><span className="doctor-state-icon">+</span><div><h3>No doctor profiles are published yet</h3><p>Published doctor profiles will appear here. You can also browse the directory or contact the hospital.</p></div><Link href="/doctors">Open doctor directory</Link></div>;

  const translateX = -(index * (100 / perView));

  return (
    <div
      className="doctor-carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onKeyDown={handleKeyDown}
      aria-label="Doctor profiles carousel"
      role="region"
    >
      <div className="doctor-carousel-viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          ref={trackRef}
          className="doctor-carousel-track"
          style={{ transform: `translateX(${translateX}%)` }}
          aria-live="polite"
        >
          {doctors.map((doctor) => (
            <div
              key={doctor.id}
              className="doctor-carousel-slide"
              style={{ flex: `0 0 ${100 / perView}%`, maxWidth: `${100 / perView}%` }}
            >
              <DoctorCard {...doctor} />
            </div>
          ))}
        </div>
      </div>

      <div className="doctor-carousel-controls">
        <button type="button" className="dc-arrow dc-arrow-prev" onClick={prev} disabled={index === 0} aria-label="Previous doctors">
          ←
        </button>
        <div className="dc-dots" role="tablist" aria-label="Carousel position">
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to slide ${i + 1}`}
              className={`dc-dot${i === index ? " active" : ""}`}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button type="button" className="dc-arrow dc-arrow-next" onClick={next} disabled={index >= maxIndex} aria-label="Next doctors">
          →
        </button>
      </div>
    </div>
  );
}
