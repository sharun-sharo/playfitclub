"use client";

import { useLayoutEffect, useState, type Ref, type RefObject } from "react";

function seedText(ref: Ref<HTMLElement> | undefined, value: string) {
  if (!ref || typeof ref === "function") return;
  const el = (ref as RefObject<HTMLElement | null>).current;
  if (el && !el.textContent) el.textContent = value;
}

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

/**
 * Live values are written from the rAF loop via refs. Do not put React text children
 * on those nodes — a parent re-render would reset score/distance and flicker the HUD.
 */
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
  caloriesRef,
  calories = "—",
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
  caloriesRef?: Ref<HTMLElement>;
  /** Static / SSR fallback when caloriesRef is unused. */
  calories?: string;
  note: string | null;
  keyboard: boolean;
  className?: string;
  /** Portrait Mobile Only: tight strip + collapsible move stats. */
  layout?: "full" | "compact";
}) {
  const [statsOpen, setStatsOpen] = useState(false);
  const compact = layout === "compact";

  useLayoutEffect(() => {
    seedText(scoreRef, "0");
    seedText(distanceRef, "0 m");
    seedText(timeRef, "0:00");
    seedText(jumpRef, "0");
    seedText(squatRef, "0");
    seedText(rightRef, "0");
    seedText(leftRef, "0");
    seedText(coinsRef, "0");
    if (caloriesRef) seedText(caloriesRef, calories);
  }, [scoreRef, distanceRef, timeRef, jumpRef, squatRef, rightRef, leftRef, coinsRef, caloriesRef, calories]);

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
      <p ref={scoreRef} className={compact ? "phone-compact-score" : "font-display text-4xl leading-none"} />
      {compact ? (
        <div className="phone-compact-strip">
          <span className="phone-compact-stat">
            <DistPinIcon />
            <span className="phone-compact-k">Dist</span> <span ref={distanceRef} />
          </span>
          <span className="phone-compact-stat">
            <CalFlameIcon />
            <span className="phone-compact-k">Cal</span>{" "}
            <span ref={caloriesRef} data-calories="">
              {caloriesRef ? null : calories}
            </span>
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
            <dd ref={distanceRef} />
          </>
        )}
        <dt>Time</dt>
        <dd ref={timeRef} />
        {compact ? null : (
          <>
            <dt>Calories burned</dt>
            <dd ref={caloriesRef} data-calories="">
              {caloriesRef ? null : calories}
            </dd>
          </>
        )}
        <dt>Jump</dt>
        <dd ref={jumpRef} data-jumps="" />
        <dt>Squat</dt>
        <dd ref={squatRef} data-squats="" />
        <dt>Right</dt>
        <dd ref={rightRef} data-lane-right="" />
        <dt>Left</dt>
        <dd ref={leftRef} data-lane-left="" />
        <dt>Coins</dt>
        <dd ref={coinsRef} data-coins="" />
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
