"use client";

import { CirclePlay, Play, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { trackEvent } from "@/components/analytics/track-event";
import { HeroPicture } from "@/components/marketing/hero-picture";
import { ensureMotionStyles } from "@/components/marketing/motion-css";

const slides = [
  {
    id: "run",
    name: "Run",
    live: "Run. Move forward.",
    jpeg: "/marketing/hero-run.jpg",
    png: "/marketing/hero-run.png",
    alt: "Illustrated home-play scene. A woman in a teal shirt jogs in a living room. The television banner reads Run, Move forward.",
  },
  {
    id: "jump",
    name: "Jump",
    live: "Jump. Leap over.",
    jpeg: "/marketing/hero-jump.jpg",
    png: "/marketing/hero-jump.png",
    alt: "Illustrated home-play scene. A woman in a teal shirt jumps in a living room. The television banner reads Jump, Leap over.",
  },
  {
    id: "squat",
    name: "Squat",
    live: "Squat. Duck under.",
    jpeg: "/marketing/hero-squat.jpg",
    png: "/marketing/hero-squat.png",
    alt: "Illustrated home-play scene. A woman in a teal shirt squats in a living room. The television banner reads Squat, Duck under.",
  },
] as const;

const SLIDE_MS = 5600;
const FADE_MS = 640;

export function HeroShowcase() {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [animate, setAnimate] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [paused, setPaused] = useState(false);
  const indexRef = useRef(0);
  const goRef = useRef<(next: number) => void>(() => {});
  const leaveTimer = useRef<number | null>(null);
  const reducedRef = useRef(false);
  const pauseRef = useRef(false);
  const holds = useRef({ hover: false, focus: false });
  const clockRef = useRef({ pause() {}, resume() {} });

  function syncHold() {
    const held = holds.current.hover || holds.current.focus || document.hidden;
    pauseRef.current = holds.current.hover || holds.current.focus;
    setPaused(held);
    if (held) clockRef.current.pause();
    else clockRef.current.resume();
  }

  function go(next: number) {
    const normalized = (next + slides.length) % slides.length;
    if (normalized === indexRef.current) return;
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
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(index - 1);
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
    if (delta <= -48) go(index + 1);
    else if (delta >= 48) go(index - 1);
  }

  function onFocusCapture(event: FocusEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches(":focus-visible")) return;
    holds.current.focus = true;
    syncHold();
  }

  function onBlurCapture(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    holds.current.focus = false;
    syncHold();
  }

  const active = slides[index];
  const progressStyle = { "--fp-slide-ms": `${SLIDE_MS}ms` } as CSSProperties;

  return (
    <>
      <div className="fp-hero-copy">
        <h1 id="hero-title">
          <span className="fp-hero-line">You Move.</span>
          <span className="fp-hero-line">The Game Moves.</span>
        </h1>
        <p className="fp-hero-lead">No buttons. No controllers. Just your body in action.</p>
        <div className="fp-hero-story">
          <p className="fp-hero-sub fp-hero-rise">Turn your workout into an adventure.</p>
          <p className="fp-hero-body fp-hero-rise">
            Run, fight, dance and play exciting fitness games using your body movements. Your phone camera is the controller — your TV or laptop is the playground.
          </p>
          <p className="fp-hero-note fp-hero-rise">Play at home or through your gym membership.</p>
        </div>
        <div className="fp-actions">
          <span className="fp-hero-cta fp-hero-rise">
            <Link
              className="fp-btn fp-btn-primary"
              href="/play/fit-run"
              onClick={() => {
                trackEvent("play_clicked", { surface: "home" });
                trackEvent("fit_run_selected", { surface: "home" });
              }}
            >
              <Play aria-hidden="true" />
              Play at home
            </Link>
          </span>
          <span className="fp-hero-cta fp-hero-rise">
            <Link className="fp-btn fp-btn-dark" href="/gyms">
              <Users aria-hidden="true" />
              For gyms
            </Link>
          </span>
          <span className="fp-hero-cta fp-hero-rise">
            <a className="fp-btn fp-btn-ghost" href="#experience">
              <CirclePlay aria-hidden="true" />
              Watch how it works
            </a>
          </span>
        </div>
      </div>
      <figure className="fp-stage">
        <div
          id="hero-showcase"
          className="fp-hero-carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label={active.live}
          onKeyDown={onStageKeyDown}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
          }}
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
          <p className="fp-hero-live" aria-live="polite">
            {active.live}
          </p>
          {autoplay ? (
            <div className="fp-hero-progress" style={progressStyle} aria-hidden="true">
              <span key={index} className={paused ? "is-run is-paused" : "is-run"} />
            </div>
          ) : null}
          <div className="fp-hero-slides">
            {slides.map((item, itemIndex) => {
              const shown = itemIndex === index;
              const className = [
                "fp-hero-slide",
                shown ? "is-active" : "",
                shown && animate ? "is-animate" : "",
                itemIndex === leaving ? "is-leaving" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div key={item.id} className={className} aria-hidden={shown ? undefined : true}>
                  <HeroPicture jpeg={item.jpeg} png={item.png} alt={item.alt} priority={item.id === "run"} />
                </div>
              );
            })}
          </div>
          <button className="fp-hero-arrow fp-hero-prev" type="button" aria-label="Previous showcase" onClick={() => go(index - 1)}>
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M12.2 4.4 6.6 10l5.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="fp-hero-arrow fp-hero-next" type="button" aria-label="Next showcase" onClick={() => go(index + 1)}>
            <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
              <path d="M7.8 4.4 13.4 10l-5.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="fp-hero-dots">
            {slides.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show ${item.name}`}
                aria-current={itemIndex === index ? "true" : undefined}
                onClick={() => go(itemIndex)}
              />
            ))}
          </div>
        </div>
      </figure>
    </>
  );
}
