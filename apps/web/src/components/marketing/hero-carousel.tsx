"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

const slides = [
  {
    src: "/marketing/fitness-player-hero.jpg",
    alt: "An athletic woman jogs in a sunlit living room. A phone on the table faces her, and the television shows a three-lane run with a Hawaiian market on the left and a beach on the right.",
    caption:
      "Home play, illustrated: a phone faces the player and the television shows a three-lane tropical run. This is not a capture of live gameplay.",
  },
  {
    src: "/marketing/hero-squat.jpg",
    alt: "An athletic woman squats in a sunlit living room. The television shows a runner ducking under an overhead bar on a tropical three-lane track, with a market on the left and a beach on the right.",
    caption: "She squats, and the runner on the television ducks under an overhead bar. Illustrated, not a live capture.",
  },
  {
    src: "/marketing/hero-jump.jpg",
    alt: "An athletic woman jumps in a sunlit living room. The television shows a runner clearing a low hurdle on a tropical three-lane track, with a market on the left and a beach on the right.",
    caption: "She jumps, and the runner on the television clears a low hurdle. Illustrated, not a live capture.",
  },
] as const;

export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const slide = slides[index] ?? slides[0];

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || paused) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 7000);
    const stop = () => {
      if (media.matches) setPaused(true);
    };
    media.addEventListener("change", stop);
    return () => {
      window.clearInterval(id);
      media.removeEventListener("change", stop);
    };
  }, [paused]);

  function go(next: number) {
    setIndex((next + slides.length) % slides.length);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest("button")) return;
    drag.current = { x: event.clientX, id: event.pointerId };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    const delta = event.clientX - drag.current.x;
    drag.current = null;
    if (delta <= -48) go(index + 1);
    else if (delta >= 48) go(index - 1);
  }

  return (
    <figure className="fp-stage">
      <div
        className="fp-hero-carousel"
        role="region"
        aria-roledescription="carousel"
        aria-label="Home play scenes"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
        }}
      >
        <div className="fp-hero-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {slides.map((item, slideIndex) => (
            <div key={item.src} className="fp-hero-slide" aria-hidden={slideIndex !== index}>
              <img src={item.src} alt={item.alt} width={864} height={1152} />
            </div>
          ))}
        </div>
        <button className="fp-hero-arrow fp-hero-prev" type="button" aria-label="Previous scene" onClick={() => go(index - 1)}>
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M12.2 4.4 6.6 10l5.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button className="fp-hero-arrow fp-hero-next" type="button" aria-label="Next scene" onClick={() => go(index + 1)}>
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M7.8 4.4 13.4 10l-5.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="fp-hero-dots">
          {slides.map((item, slideIndex) => (
            <button
              key={item.src}
              type="button"
              aria-label={`Show scene ${slideIndex + 1}`}
              aria-current={slideIndex === index ? "true" : undefined}
              onClick={() => go(slideIndex)}
            />
          ))}
        </div>
      </div>
      <figcaption aria-live="polite">{slide.caption}</figcaption>
    </figure>
  );
}
