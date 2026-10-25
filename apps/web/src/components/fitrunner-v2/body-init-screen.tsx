"use client";

import type { MouseEvent } from "react";
import type { BodyInitView } from "@/components/fitrunner-v2/body-init";

const JOINTS = [
  [100, 78],
  [58, 100],
  [142, 100],
  [34, 168],
  [166, 168],
  [24, 232],
  [176, 232],
  [76, 176],
  [124, 176],
  [68, 286],
  [132, 286],
  [60, 392],
  [140, 392],
] as const;

/**
 * TV and laptop only. The skeleton is an illustration, not a pose the player must match.
 * One transform animation. Reduced motion keeps a still figure.
 */
export function BodyInitScreen({
  view,
  step,
  onKeyboard,
  onRetry,
}: {
  view: BodyInitView;
  step: string;
  onKeyboard: (event: MouseEvent<HTMLButtonElement>) => void;
  onRetry: () => void;
}) {
  const lit = view.joints === "lit";
  const bone = lit ? "#9aa394" : "#4e564f";
  const joint = lit ? "#BEFF39" : "#2c332e";
  const offerKeyboardPlay = process.env.NODE_ENV !== "production";
  const showActions = view.key === "retry" || Boolean(view.retry) || offerKeyboardPlay;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 flex flex-col bg-[#16181d] px-6 text-white sm:px-12"
      data-tutorial-step={step}
      data-body-init={view.key}
      data-joints={view.joints}
      data-scan={view.scan ? "on" : "off"}
    >
      <style>{`
        @keyframes fitplay-body-scan {
          from { transform: translate3d(-100%, 0, 0); }
          to { transform: translate3d(100%, 0, 0); }
        }
        .fitplay-body-scan { animation: fitplay-body-scan 2.6s ease-in-out infinite alternate; }
        @media (prefers-reduced-motion: reduce) {
          .fitplay-body-scan { animation: none; opacity: 0; }
        }
      `}</style>
      <img
        src="/marketing/playfit-club-logo-footer.png"
        alt="PlayFit Club"
        width={220}
        height={48}
        className="mx-auto mt-6 h-10 w-auto sm:mt-8 sm:h-12 xl:h-14"
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-4 sm:gap-6">
        <div className="relative h-[min(42vh,22rem)] w-[min(46vw,16rem)] xl:h-[min(48vh,28rem)] xl:w-[min(28vw,18rem)]">
          <svg viewBox="0 0 200 440" className="h-full w-full" aria-hidden="true">
            <g fill="none" stroke={bone} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="100" cy="42" r="24" />
              <path d="M100 66 V176" />
              <path d="M58 100 H142" />
              <path d="M58 100 L34 168 L24 232" />
              <path d="M142 100 L166 168 L176 232" />
              <path d="M76 176 H124" />
              <path d="M76 176 L68 286 L60 392" />
              <path d="M124 176 L132 286 L140 392" />
            </g>
            {JOINTS.map(([x, y]) => (
              <g key={`${x}-${y}`}>
                {lit ? <circle cx={x} cy={y} r="11" fill="#BEFF39" opacity="0.28" /> : null}
                <circle cx={x} cy={y} r="5.5" fill={joint} />
              </g>
            ))}
          </svg>
          {view.scan ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="fitplay-body-scan absolute inset-y-0 left-0 w-full">
                <div className="h-full w-0.5 bg-[#BEFF39] opacity-90" />
              </div>
            </div>
          ) : null}
        </div>
        {view.countdown != null ? (
          <p
            data-countdown={view.countdown}
            className="font-display text-[clamp(6rem,14vw,11rem)] leading-none text-[#BEFF39]"
            role="status"
          >
            {view.countdown}
          </p>
        ) : (
          <h1
            data-body-init-title=""
            className="max-w-4xl text-center font-display text-[clamp(1.7rem,3.2vw,4.25rem)] leading-tight tracking-[0.12em] text-[#BEFF39]"
            role="status"
          >
            {view.title}
          </h1>
        )}
        {view.detail ? (
          <p data-body-init-detail="" className="max-w-xl text-center text-[clamp(1rem,1.5vw,1.6rem)] leading-snug text-white/80">
            {view.detail}
          </p>
        ) : null}
        {view.retry ? <p className="max-w-xl text-center text-lg text-white/80">{view.retry}</p> : null}
      </div>
      {showActions ? (
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 pb-6 sm:pb-8">
          {view.key === "retry" || view.retry ? (
            <button type="button" className="rounded-full border border-white/25 px-5 py-3 text-sm text-white" onClick={onRetry}>
              Try again
            </button>
          ) : null}
          {offerKeyboardPlay ? (
            <button
              type="button"
              className="rounded-full border border-white/25 px-5 py-3 text-sm text-white"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onKeyboard}
            >
              Play with keyboard
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
