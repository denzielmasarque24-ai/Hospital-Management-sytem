"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type HeroSlide = {
  src: string;
  alt: string;
  objectPosition?: string;
};

type HeroCarouselProps = {
  slides: HeroSlide[];
  autoPlayMs?: number;
};

export function HeroCarousel({ slides, autoPlayMs = 5000 }: HeroCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isInteractionPaused, setIsInteractionPaused] = useState(false);
  const interactionTimer = useRef<number | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (slides.length < 2 || isHovered || isInteractionPaused || prefersReducedMotion) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentSlide((previous) => (previous + 1) % slides.length);
    }, autoPlayMs);

    return () => window.clearInterval(interval);
  }, [autoPlayMs, isHovered, isInteractionPaused, slides.length]);

  useEffect(() => () => {
    if (interactionTimer.current !== null) window.clearTimeout(interactionTimer.current);
  }, []);

  const pauseForInteraction = () => {
    setIsInteractionPaused(true);
    if (interactionTimer.current !== null) window.clearTimeout(interactionTimer.current);
    interactionTimer.current = window.setTimeout(() => {
      setIsInteractionPaused(false);
      interactionTimer.current = null;
    }, autoPlayMs);
  };

  const showPrevious = () => {
    setCurrentSlide((previous) => (previous - 1 + slides.length) % slides.length);
  };

  const showNext = () => {
    setCurrentSlide((previous) => (previous + 1) % slides.length);
  };

  if (!slides.length) {
    return null;
  }

  return (
    <div
      className="hero-carousel"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="region"
      aria-label="Hospital and healthcare images"
    >
      <div className="hero-carousel-track">
        {slides.map((slide, index) => (
          <div
            key={`${slide.alt}-${index}`}
            className={`hero-slide ${index === currentSlide ? "active" : ""}`}
            aria-hidden={index !== currentSlide}
          >
            <Image src={slide.src} alt={slide.alt} fill sizes="100vw" preload={index === 0} style={slide.objectPosition ? { objectPosition: slide.objectPosition } : undefined} />
          </div>
        ))}
      </div>

      <div className="hero-carousel-controls" role="group" aria-label="Carousel controls">
        <button type="button" className="hero-carousel-button" onClick={() => { pauseForInteraction(); showPrevious(); }} aria-label="Previous image">
          ←
        </button>
        <button type="button" className="hero-carousel-button" onClick={() => { pauseForInteraction(); showNext(); }} aria-label="Next image">
          →
        </button>
      </div>

      <div className="hero-carousel-dots" aria-label="Carousel navigation">
        {slides.map((slide, index) => (
          <button
            key={`dot-${slide.alt}-${index}`}
            type="button"
            className={`hero-carousel-dot ${index === currentSlide ? "active" : ""}`}
            onClick={() => { pauseForInteraction(); setCurrentSlide(index); }}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
