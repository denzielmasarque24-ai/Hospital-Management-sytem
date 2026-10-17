"use client";

import { useEffect, useState } from "react";

type HeroSlide = {
  src: string;
  alt: string;
};

type HeroCarouselProps = {
  slides: HeroSlide[];
  autoPlayMs?: number;
};

export function HeroCarousel({ slides, autoPlayMs = 5000 }: HeroCarouselProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || isPaused) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentSlide((previous) => (previous + 1) % slides.length);
    }, autoPlayMs);

    return () => window.clearInterval(interval);
  }, [autoPlayMs, isPaused, slides.length]);

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
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-live="polite"
    >
      <div className="hero-carousel-track">
        {slides.map((slide, index) => (
          <div
            key={`${slide.alt}-${index}`}
            className={`hero-slide ${index === currentSlide ? "active" : ""}`}
            aria-hidden={index !== currentSlide}
          >
            <img src={slide.src} alt={slide.alt} />
          </div>
        ))}
      </div>

      <div className="hero-carousel-controls" aria-label="Carousel controls">
        <button type="button" className="hero-carousel-button" onClick={showPrevious} aria-label="Previous image">
          ←
        </button>
        <button type="button" className="hero-carousel-button" onClick={showNext} aria-label="Next image">
          →
        </button>
      </div>

      <div className="hero-carousel-dots" aria-label="Carousel navigation">
        {slides.map((slide, index) => (
          <button
            key={`dot-${slide.alt}-${index}`}
            type="button"
            className={`hero-carousel-dot ${index === currentSlide ? "active" : ""}`}
            onClick={() => setCurrentSlide(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
