"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { insurancePartners } from "@/lib/insurance/partners";
import "./partners.css";

export function PartnersCarousel() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const pageRef = useRef(0);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(2);
  const [step, setStep] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;
    const resize = () => {
      const perPage = Number(getComputedStyle(track).getPropertyValue("--partners-per-page")) || 5;
      setPageCount(Math.ceil(insurancePartners.length / perPage));
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      setStep(viewport.clientWidth + gap);
      pageRef.current = 0;
      setPage(0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();
    return () => observer.disconnect();
  }, []);

  const goTo = useCallback((nextPage: number) => {
    const target = ((nextPage % pageCount) + pageCount) % pageCount;
    pageRef.current = target;
    setPage(target);
  }, [pageCount]);

  useEffect(() => {
    if (hovered || focused || reducedMotion || pageCount < 2) return;
    const interval = window.setInterval(() => goTo(pageRef.current + 1), 4000);
    return () => window.clearInterval(interval);
  }, [goTo, hovered, focused, reducedMotion, pageCount]);

  return <section className="home-partners" aria-labelledby="home-partners-title" aria-roledescription="carousel"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    <div className="container">
      <header className="home-partners-heading">
        <span className="section-eyebrow">OUR PARTNERS</span>
        <h2 id="home-partners-title">Accepted Insurance &amp; <em>Healthcare Partners</em></h2>
        <p>We work with trusted insurance companies and healthcare partners to provide you with accessible and quality care.</p>
      </header>
      <div className="home-partners-slider">
        <button type="button" className="home-partners-arrow" onClick={() => goTo(pageRef.current - 1)} aria-label="Previous partners" aria-controls="home-partners-track"><ChevronLeft size={21} aria-hidden="true" /></button>
        <div className="home-partners-viewport" ref={viewportRef}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            swipeStart.current = { x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { swipeStart.current = null; }}
          onPointerUp={(event) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            if (!start) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) goTo(pageRef.current + (dx < 0 ? 1 : -1));
          }}>
        <ul className="home-partners-track" id="home-partners-track" ref={trackRef}
          style={{ transform: `translate3d(-${page * step}px, 0, 0)`, transitionDuration: reducedMotion ? "0ms" : undefined }}
          aria-label="Insurance and healthcare partner logos">
          {insurancePartners.map((partner) => <li className="home-partner-card" key={partner.src}><img src={partner.src} alt={partner.name} loading="lazy" width={200} height={100} /></li>)}
        </ul>
        </div>
        <button type="button" className="home-partners-arrow" onClick={() => goTo(pageRef.current + 1)} aria-label="Next partners" aria-controls="home-partners-track"><ChevronRight size={21} aria-hidden="true" /></button>
      </div>
      <nav className="home-partners-dots" aria-label="Partner carousel pages">
        {Array.from({ length: pageCount }, (_, index) => <button key={index} type="button" onClick={() => goTo(index)} aria-label={`Partner page ${index + 1}`} aria-current={page === index ? "true" : undefined} aria-controls="home-partners-track" />)}
      </nav>
      <p className="home-partners-note">Please confirm current coverage and eligibility with the hospital or your insurance provider.</p>
    </div>
  </section>;
}
