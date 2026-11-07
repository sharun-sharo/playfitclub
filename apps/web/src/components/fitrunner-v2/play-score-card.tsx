"use client";

import { useState, type Ref } from "react";

function DistPinIcon() {
  return (
    <svg className="phone-compact-ico phone-compact-ico-dist" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.5A4.3 4.3 0 0 0 3.7 5.8c0 2.7 3.3 7.4 4.1 8.4a.3.3 0 0 0 .4 0c.8-1 4.1-5.7 4.1-8.4A4.3 4.3 0 0 0 8 1.5Zm0 6.1a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z"
      />
    </svg>
  );
}

function CalFlameIcon() {
  return (
    <svg className="phone-compact-ico phone-compact-ico-cal" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.1 1.2c.2 1.7-.4 2.8-1.4 3.8-.9.9-1.9 1.8-2.2 3.3A4.1 4.1 0 0 0 8 15a4.1 4.1 0 0 0 3.6-6.2c-.7-1.1-.6-2.2-.1-3.5.2-.6.5-1.2.7-1.9-1.4.5-2.4 1.2-3 2.1-.1-1.5-.4-2.8-1.1-4.3Z"
      />
    </svg>
  );
}

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
      {compact ? null : <p className="text-[10px] tracking-[0.18em] text-[#d6ff4a]">SCORE</p>}
      <p ref={scoreRef} className={compact ? "phone-compact-score" : "font-display text-4xl leading-none"}>
        0
      </p>
      {compact ? (
        <div className="phone-compact-strip">
          <span className="phone-compact-stat">
            <DistPinIcon />
            <span className="phone-compact-k">Dist</span> <span ref={distanceRef}>0 m</span>
          </span>
          <span className="phone-compact-stat">
            <CalFlameIcon />
            <span className="phone-compact-k">Cal</span> <span data-calories="">{calories}</span>
          </span>
          <button
            type="button"
            className="phone-stats-toggle"
            aria-expanded={statsOpen}
            onClick={() => setStatsOpen((open) => !open)}
          >
            {statsOpen ? "Less" : (
              <>
                <span className="phone-stats-ico" aria-hidden="true">
                  ▦
                </span>{" "}
                Stats
              </>
            )}
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
      <p
        className={compact ? "phone-compact-keys" : "mt-3 text-[10px] leading-relaxed text-[#9aa8bd]"}
        data-keyboard-hint=""
        hidden={!keyboard}
      >
        Keyboard : A D lanes · Space jump · S roll
      </p>
    </section>
  );
}
