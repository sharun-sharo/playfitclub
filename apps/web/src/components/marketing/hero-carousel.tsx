"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { trackEvent } from "@/components/analytics/track-event";
import { HeroPicture } from "@/components/marketing/hero-picture";
import { ensureMotionStyles } from "@/components/marketing/motion-css";

const slides = [
  {
    id: "run",
    name: "Run",
    live: "Phone and TV. Mirror play.",
    jpeg: "/marketing/hero-run-adventure.jpg",
    png: "/marketing/hero-run-adventure.jpg",
    alt: "Woman running in a living room while Fit Run plays on the TV, with neon motion tracking under her feet.",
  },
  {
    id: "jump",
    name: "Jump",
    live: "Laptop. Webcam play.",
    jpeg: "/marketing/hero-jump-leap.jpg",
    png: "/marketing/hero-jump-leap.jpg",
    alt: "Man performing a tuck jump in a living room, synced with the PlayFit Club JUMP challenge on a laptop.",
  },
  {
    id: "squat",
    name: "Squat",
    live: "Mobile. Phone only.",
    jpeg: "/marketing/hero-squat-challenge.jpg",
    png: "/marketing/hero-squat-challenge.jpg",
    alt: "Woman performing a squat challenge in a neon-lit living room using the PlayFit Club mobile app on a giant vertical screen.",
  },
] as const;

const SLIDE_MS = 5000;
const FADE_MS = 600;

export function HeroShowcase() {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [animate, setAnimate] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [, setPaused] = useState(false);
  const indexRef = useRef(0);
  const goRef = useRef<(next: number) => void>(() => {});
  const leaveTimer = useRef<number | null>(null);
  const reducedRef = useRef(false);
  const pauseRef = useRef(false);
  const holds = useRef({ hover: false, focus: false, manual: false });
  const clockRef = useRef({ pause() {}, resume() {} });
  const manualTimer = useRef<number | null>(null);

  function syncHold() {
    const held = holds.current.hover || holds.current.focus || holds.current.manual || document.hidden;
    pauseRef.current = holds.current.hover || holds.current.focus || holds.current.manual;
    setPaused(held);
    if (held) clockRef.current.pause();
    else clockRef.current.resume();
  }

  function bumpManualPause() {
    holds.current.manual = true;
    syncHold();
    if (manualTimer.current) window.clearTimeout(manualTimer.current);
    manualTimer.current = window.setTimeout(() => {
      holds.current.manual = false;
      syncHold();
    }, SLIDE_MS);
  }

  function go(next: number, fromUser = false) {
    const normalized = (next + slides.length) % slides.length;
    if (normalized === indexRef.current) return;
    if (fromUser) bumpManualPause();
    const reduce = reducedRef.current;
    if (!reduce) setLeaving(indexRef.current);
    indexRef.current = normalized;
    setAnimate(!reduce);
    setIndex(normalized);
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    if (!reduce) leaveTimer.current = window.setTimeout(() => setLeaving(null), FADE_MS + 40);
  }

  goRef.current = go;

  useEffect(() => {
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      if (manualTimer.current) window.clearTimeout(manualTimer.current);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = media.matches;
    if (!media.matches && !document.head.querySelector("style[data-fp-hero=seen]")) {
      const seen = window.setTimeout(() => {
        try {
          sessionStorage.setItem("fp-hero-seen", "1");
        } catch {
          /* The next full load can play the entrance again. */
        }
        ensureMotionStyles(true);
      }, 2500);
      return () => window.clearTimeout(seen);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      reducedRef.current = media.matches;
      setAutoplay(!media.matches);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!autoplay) return;
    let timeout = 0;
    let start = 0;
    let remain = SLIDE_MS;
    let alive = true;

    const clear = () => {
      window.clearTimeout(timeout);
      timeout = 0;
    };

    const arm = (ms: number) => {
      clear();
      remain = ms;
      if (!alive || pauseRef.current || document.hidden) return;
      start = performance.now();
      timeout = window.setTimeout(() => {
        timeout = 0;
        goRef.current(indexRef.current + 1);
      }, ms);
    };

    const pause = () => {
      if (!timeout) return;
      remain = Math.max(200, remain - (performance.now() - start));
      clear();
    };

    const resume = () => {
      if (!alive || pauseRef.current || document.hidden) return;
      arm(remain || SLIDE_MS);
    };

    clockRef.current = { pause, resume };
    arm(SLIDE_MS);

    const onVis = () => {
      if (!alive) return;
      if (document.hidden) {
        pause();
        setPaused(true);
      } else if (!pauseRef.current) {
        setPaused(false);
        resume();
      }
    };

    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clear();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [autoplay, index]);

  function onStageKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(index + 1, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1, true);
    }
  }

  const drag = useRef<{ x: number; id: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest("button")) return;
    drag.current = { x: event.clientX, id: event.pointerId };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.id !== event.pointerId) return;
    const delta = event.clientX - drag.current.x;
    drag.current = null;
    if (delta <= -48) go(index + 1, true);
    else if (delta >= 48) go(index - 1, true);
  }

  function onFocusCapture(event: FocusEvent<HTMLElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(":focus-visible")) return;
    holds.current.focus = true;
    syncHold();
  }

  function onBlurCapture(event: FocusEvent<HTMLElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    holds.current.focus = false;
    syncHold();
  }

  const active = slides[index];

  return (
    <>
      <div className="fp-hero-copy">
        <div className="fp-hero-copy-main">
          <h1 id="hero-title">
            <span className="fp-hero-line">You Move.</span>
            <span className="fp-hero-line fp-hero-line--accent">The Game Moves.</span>
          </h1>
          <p className="fp-hero-lead">No buttons. No controllers. Just your body in action.</p>
          <span className="fp-hero-divider" aria-hidden="true" />
          <div className="fp-hero-story">
            <p className="fp-hero-sub fp-hero-rise">Turn your workout into an adventure.</p>
            <p className="fp-hero-body fp-hero-rise">
              Play Fit Run on a laptop, on your phone, or on your phone mirrored to a TV. Your camera tracks your body. Fit Fight and Fit Dance are coming soon.
            </p>
          </div>
        </div>
        <div className="fp-actions fp-hero-cta-row">
          <span className="fp-hero-cta fp-hero-rise">
            <Link
              className="fp-btn fp-btn-primary"
              href="/games"
              onClick={() => {
                trackEvent("play_clicked", { surface: "home" });
                trackEvent("fit_run_selected", { surface: "home-phone" });
              }}
            >
              <Play aria-hidden="true" />
              Play Demo
            </Link>
          </span>
        </div>
      </div>
      <figure
        className="fp-stage"
        onMouseEnter={() => {
          holds.current.hover = true;
          syncHold();
        }}
        onMouseLeave={() => {
          holds.current.hover = false;
          syncHold();
        }}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
      >
        <div
          id="hero-showcase"
          className="fp-hero-carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label={active.live}
          tabIndex={0}
          onKeyDown={onStageKeyDown}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <div className="fp-hero-slides">
            {slides.map((item, itemIndex) => {
              const shown = itemIndex === index;
              const className = [
                "fp-hero-slide",
                `fp-hero-slide--${item.id}`,
                shown ? "is-active" : "",
                shown && animate ? "is-animate" : "",
                itemIndex === leaving ? "is-leaving" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div
                  key={item.id}
                  className={className}
                  data-slide={item.id}
                  aria-hidden={shown ? undefined : true}
                >
                  <HeroPicture jpeg={item.jpeg} png={item.png} alt={item.alt} priority={item.id === "run"} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="fp-hero-controls">
          <p className="fp-visually-hidden" aria-live="polite">
            Showcase {index + 1} of {slides.length}: {active.name}. {active.live}
          </p>
          <div className="fp-hero-nav">
            <div className="fp-hero-arrows">
              <button className="fp-hero-arrow fp-hero-prev" type="button" aria-label="Previous showcase" onClick={() => go(index - 1, true)}>
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M12.2 4.4 6.6 10l5.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button className="fp-hero-arrow fp-hero-next" type="button" aria-label="Next showcase" onClick={() => go(index + 1, true)}>
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M7.8 4.4 13.4 10l-5.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div className="fp-hero-dots">
              {slides.map((item, itemIndex) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Show ${item.name}`}
                  aria-current={itemIndex === index ? "true" : undefined}
                  onClick={() => go(itemIndex, true)}
                />
              ))}
            </div>
          </div>
        </div>
      </figure>
    </>
  );
}
