"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DoctorCard } from "./DoctorCard";

const doctors = [
  {
    name: "Dr. Maria Santos",
    specialty: "General Medicine",
    experience: "12 years experience",
    availability: "Available Today",
    image: "/images/doctors/D1.jpg",
  },
  {
    name: "Dr. John Reyes",
    specialty: "Cardiology",
    experience: "15 years experience",
    availability: "Available Today",
    image: "/images/doctors/D2.jpg",
  },
  {
    name: "Dr. Angela Cruz",
    specialty: "Pediatrics",
    experience: "10 years experience",
    availability: "Available This Week",
    image: "/images/doctors/D3.jpg",
  },
  {
    name: "Dr. Michael Garcia",
    specialty: "Internal Medicine",
    experience: "14 years experience",
    availability: "Available Monday",
    image: "/images/doctors/D4.jpg",
  },
  {
    name: "Dr. Sophia Martinez",
    specialty: "Dermatology",
    experience: "9 years experience",
    availability: "Available Friday",
    image: "/images/doctors/D5.jpg",
  },
  {
    name: "Dr. Daniel Aquino",
    specialty: "Orthopedics",
    experience: "11 years experience",
    availability: "Available Tomorrow",
    image: "/images/doctors/D6.jpg",
  },
  {
    name: "Dr. Christine Lopez",
    specialty: "Obstetrics & Gynecology",
    experience: "13 years experience",
    availability: "Available Wednesday",
    image: "/images/doctors/D7.jpg",
  },
];

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
  const total = doctors.length;
  const maxIndex = Math.max(0, total - perView);
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const isAnimating = useRef(false);

  // clamp index when perView changes
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, total - perView)));
  }, [perView, total]);

  const go = useCallback(
    (next: number) => {
      if (isAnimating.current) return;
      isAnimating.current = true;
      setIndex(Math.max(0, Math.min(next, maxIndex)));
      setTimeout(() => { isAnimating.current = false; }, 400);
    },
    [maxIndex],
  );

  const prev = useCallback(() => go(index - 1), [go, index]);
  const next = useCallback(() => go(index + 1), [go, index]);

  // autoplay
  useEffect(() => {
    if (isPaused || maxIndex === 0) return;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i >= maxIndex ? 0 : i + 1));
    }, 4500);
    return () => window.clearInterval(id);
  }, [isPaused, maxIndex]);

  // keyboard
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  };

  // touch swipe
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : prev();
    touchStartX.current = null;
  };

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
      <div
        className="doctor-carousel-viewport"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          ref={trackRef}
          className="doctor-carousel-track"
          style={{ transform: `translateX(${translateX}%)` }}
          aria-live="polite"
        >
          {doctors.map((doctor) => (
            <div
              key={doctor.name}
              className="doctor-carousel-slide"
              style={{ flex: `0 0 ${100 / perView}%`, maxWidth: `${100 / perView}%` }}
            >
              <DoctorCard
                name={doctor.name}
                specialty={doctor.specialty}
                experience={doctor.experience}
                availability={doctor.availability}
                image={doctor.image}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="doctor-carousel-controls">
        <button
          type="button"
          className="dc-arrow dc-arrow-prev"
          onClick={prev}
          disabled={index === 0}
          aria-label="Previous doctors"
        >
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

        <button
          type="button"
          className="dc-arrow dc-arrow-next"
          onClick={next}
          disabled={index >= maxIndex}
          aria-label="Next doctors"
        >
          →
        </button>
      </div>
    </div>
  );
}
