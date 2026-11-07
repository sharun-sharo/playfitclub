"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { trackEvent } from "@/components/analytics/track-event";
import { PLAY_HUB_PATH } from "@/components/fitrunner-v2/phone-local-play";
import { HeroPicture } from "@/components/marketing/hero-picture";
import { ensureMotionStyles } from "@/components/marketing/motion-css";

const slides = [
  {
    id: "run",
    name: "Run",
    live: "Fit Run. You move. The course moves.",
    jpeg: "/marketing/hero-run.jpg",
    png: "/marketing/hero-run.png",
    alt: "Cinematic Fit Run scene. An athlete runs in a living room while the game responds to body movement.",
  },
  {
    id: "laptop",
    name: "Laptop",
    live: "Laptop. Webcam play in the browser.",
    jpeg: "/marketing/hero-laptop.jpg",
    png: "/marketing/hero-laptop.png",
    alt: "Laptop Fit Run. An athlete jumps while the webcam tracks movement and the game plays on the laptop.",
  },
  {
    id: "mobile",
    name: "Mobile",
    live: "Mobile. Phone camera and game.",
    jpeg: "/marketing/hero-mobile.jpg",
    png: "/marketing/hero-mobile.png",
    alt: "Mobile-only Fit Run. An athlete squats while the phone camera tracks the body and the game plays on the phone.",
  },
] as const;

const SLIDE_MS = 6200;
const FADE_MS = 900;

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
  const stageRef = useRef<HTMLDivElement>(null);

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
          /* next full load can play entrance again */
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

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (event: MouseEvent) => {
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        stage.style.setProperty("--fp-parallax-x", `${(x * 1.4).toFixed(3)}%`);
        stage.style.setProperty("--fp-parallax-y", `${(y * 1.1).toFixed(3)}%`);
      });
    };
    const onLeave = () => {
      stage.style.setProperty("--fp-parallax-x", "0%");
      stage.style.setProperty("--fp-parallax-y", "0%");
    };
    stage.addEventListener("mousemove", onMove);
    stage.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener("mousemove", onMove);
      stage.removeEventListener("mouseleave", onLeave);
    };
  }, []);

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
    if (event.target instanceof Element && event.target.closest("a, button")) return;
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
    <div
      ref={stageRef}
      id="hero-showcase"
      className="fp-hero-cine"
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
      <div className="fp-hero-plane" aria-hidden="true">
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
                <HeroPicture jpeg={item.jpeg} png={item.png} alt="" priority={item.id === "run"} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="fp-hero-scrim" aria-hidden="true" />
      <div className="fp-hero-copy">
        <p className="fp-hero-brand fp-hero-rise">PlayFit Club</p>
        <h1 id="hero-title">
          <span className="fp-hero-line">You Move.</span>
          <span className="fp-hero-line">The Game Moves.</span>
        </h1>
        <p className="fp-hero-lead">
          Motion-controlled Fit Run. Play on laptop, phone, or phone mirrored to a TV.
        </p>
        <div className="fp-actions">
          <span className="fp-hero-cta fp-hero-rise">
            <Link
              className="fp-btn fp-btn-primary"
              href={PLAY_HUB_PATH}
              onClick={() => {
                trackEvent("play_clicked", { surface: "home" });
                trackEvent("fit_run_selected", { surface: "home-hero" });
              }}
            >
              <Play aria-hidden="true" />
              Play Now
            </Link>
          </span>
          <span className="fp-hero-cta fp-hero-rise">
            <a className="fp-btn fp-btn-ghost" href="#experience">
              Choose how you play
            </a>
          </span>
        </div>
      </div>
      <p className="fp-hero-live" aria-live="polite">
        {active.live}
      </p>
      {autoplay ? (
        <div className="fp-hero-progress" style={progressStyle} aria-hidden="true">
          <span key={index} className={paused ? "is-run is-paused" : "is-run"} />
        </div>
      ) : null}
      <div className="fp-hero-rail">
        <button className="fp-hero-arrow fp-hero-prev" type="button" aria-label="Previous showcase" onClick={() => go(index - 1)}>
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M12.2 4.4 6.6 10l5.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
        <button className="fp-hero-arrow fp-hero-next" type="button" aria-label="Next showcase" onClick={() => go(index + 1)}>
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M7.8 4.4 13.4 10l-5.6 5.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
