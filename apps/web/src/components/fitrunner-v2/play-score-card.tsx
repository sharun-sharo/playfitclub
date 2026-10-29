"use client";

import type { Ref } from "react";

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
}) {
  return (
    <section
      className={`pointer-events-none absolute left-4 z-10 w-52 rounded-2xl border border-[#d6ff4a]/35 bg-[#10141ccc] px-4 py-3 shadow-xl backdrop-blur-sm ${className ?? "top-4"}`}
      data-fitrunner-play-hud=""
      hidden={hidden}
    >
      <p className="text-[10px] tracking-[0.18em] text-[#d6ff4a]">SCORE</p>
      <p ref={scoreRef} className="font-display text-4xl leading-none">
        0
      </p>
      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-xs text-[#d5deea]">
        <dt>Distance</dt>
        <dd ref={distanceRef}>0 m</dd>
        <dt>Time</dt>
        <dd ref={timeRef}>0:00</dd>
        <dt>Calories burned</dt>
        <dd data-calories="">{calories}</dd>
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
        <p className="mt-3 text-[10px] leading-relaxed text-[#9aa8bd]" data-calorie-note="">
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
