"use client";

import { useState, type Ref } from "react";

export function PlayScoreCard({
  hidden,
  scoreRef,
  distanceRef,
  timeRef,
  jumpRef,
  squatRef,
  rightRef,
  leftRef,
  coinsRef,
  calories,
  note,
  keyboard,
  className,
  layout = "full",
}: {
  hidden: boolean;
  scoreRef: Ref<HTMLParagraphElement>;
  distanceRef: Ref<HTMLElement>;
  timeRef: Ref<HTMLElement>;
  jumpRef: Ref<HTMLElement>;
  squatRef: Ref<HTMLElement>;
  rightRef: Ref<HTMLElement>;
  leftRef: Ref<HTMLElement>;
  coinsRef: Ref<HTMLElement>;
  calories: string;
  note: string | null;
  keyboard: boolean;
  className?: string;
  /** Portrait Mobile Only: tight strip + collapsible move stats. */
  layout?: "full" | "compact";
}) {
  const [statsOpen, setStatsOpen] = useState(false);
  const compact = layout === "compact";

  return (
    <section
      className={
        compact
          ? `phone-compact-hud ${className ?? ""}`
          : `pointer-events-none absolute left-4 z-10 w-52 rounded-2xl border border-[#d6ff4a]/35 bg-[#10141ccc] px-4 py-3 shadow-xl backdrop-blur-sm ${className ?? "top-4"}`
      }
      data-fitrunner-play-hud=""
      data-hud-layout={layout}
      hidden={hidden}
    >
      <p className={compact ? "phone-compact-label" : "text-[10px] tracking-[0.18em] text-[#d6ff4a]"}>SCORE</p>
      <p ref={scoreRef} className={compact ? "phone-compact-score" : "font-display text-4xl leading-none"}>
        0
      </p>
      {compact ? (
        <div className="phone-compact-strip">
          <span>
            <span className="phone-compact-k">Dist</span> <span ref={distanceRef}>0 m</span>
          </span>
          <span>
            <span className="phone-compact-k">Cal</span> <span data-calories="">{calories}</span>
          </span>
          <button
            type="button"
            className="phone-stats-toggle"
            aria-expanded={statsOpen}
            onClick={() => setStatsOpen((open) => !open)}
          >
            {statsOpen ? "Less" : "Stats"}
          </button>
        </div>
      ) : null}
      <dl
        className={
          compact
            ? `phone-compact-details${statsOpen ? " is-open" : ""}`
            : "mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-xs text-[#d5deea]"
        }
        hidden={compact ? !statsOpen : undefined}
      >
        {compact ? null : (
          <>
            <dt>Distance</dt>
            <dd ref={distanceRef}>0 m</dd>
          </>
        )}
        <dt>Time</dt>
        <dd ref={timeRef}>0:00</dd>
        {compact ? null : (
          <>
            <dt>Calories burned</dt>
            <dd data-calories="">{calories}</dd>
          </>
        )}
        <dt>Jump</dt>
        <dd ref={jumpRef} data-jumps="">
          0
        </dd>
        <dt>Squat</dt>
        <dd ref={squatRef} data-squats="">
          0
        </dd>
        <dt>Right</dt>
        <dd ref={rightRef} data-lane-right="">
          0
        </dd>
        <dt>Left</dt>
        <dd ref={leftRef} data-lane-left="">
          0
        </dd>
        <dt>Coins</dt>
        <dd ref={coinsRef} data-coins="">
          0
        </dd>
      </dl>
      {note ? (
        <p
          className={compact ? "phone-compact-note" : "mt-3 text-[10px] leading-relaxed text-[#9aa8bd]"}
          data-calorie-note=""
          hidden={compact ? !statsOpen : undefined}
        >
          {note}
        </p>
      ) : null}
      {keyboard && process.env.NODE_ENV !== "production" ? (
        <p className="mt-3 text-[10px] leading-relaxed text-[#9aa8bd]" data-keyboard-hint="">
          Keyboard · A D lanes · Space jump · S roll
        </p>
      ) : null}
    </section>
  );
}
