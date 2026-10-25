"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { JOIN_NAME_MAX, readyToPlayFieldError } from "@/components/join/join-name";

export const PHONE_SAFE =
  "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]";

export type RecoveryAction = "camera" | "join" | "reconnect" | "certificate" | "resume" | "recalibrate" | "keyboard" | "preview";

export type PhoneNotice = {
  id: string;
  title: string;
  body: string;
  primary?: { label: string; action: RecoveryAction };
  secondary?: { label: string; action: RecoveryAction };
};

export function connectionCopy(link: string, latencyMs: number | null) {
  if (link !== "connected") return link === "offline" ? "Connecting" : "Reconnecting";
  if (latencyMs !== null && latencyMs > 450) return "Connection weak";
  return "Connection good";
}

export function sessionStatusCopy(status: string) {
  if (status === "LOBBY") return "Waiting to start";
  if (status === "COUNTDOWN") return "Starting";
  if (status === "RUNNING") return "Live";
  if (status === "PAUSED") return "Paused";
  if (status === "ENDED" || status === "EXPIRED" || status === "CLOSED") return "Closed";
  return "Waiting to start";
}

export function roundCopy(phase: string) {
  if (phase === "running") return "Live on the TV";
  if (phase === "paused") return "Paused on the TV";
  if (phase === "countdown") return "Get ready";
  if (phase === "ended") return "Round finished";
  return "Waiting for the TV";
}

export function joinPlayerLine() {
  return "One phone is the controller. The TV or laptop is the screen.";
}

export function calibrationProgress(calibrated: boolean, confidence: number, holding: boolean, framed: boolean) {
  if (calibrated) return 100;
  if (!framed) return 12;
  const fromConfidence = 28 + Math.round(Math.min(1, Math.max(0, confidence)) * 42);
  return Math.min(90, fromConfidence + (holding ? 12 : 0));
}

const PRACTICE = [
  { type: "lean_left", cue: "LEFT ARM UP", result: "MOVE LEFT", icon: "left" },
  { type: "lean_right", cue: "RIGHT ARM UP", result: "MOVE RIGHT", icon: "right" },
  { type: "squat", cue: "SQUAT", result: "DUCK", icon: "squat" },
  { type: "jump", cue: "SMALL JUMP", result: "JUMP", icon: "jump" },
] as const;

export function PhoneAlert({ notice, onAction }: { notice: PhoneNotice; onAction: (action: RecoveryAction) => void }) {
  return (
    <div role="alert" className="w-full max-w-full rounded-2xl border border-[#FF5A5A]/70 bg-[#2a1416] px-4 py-3 text-white">
      <p className="font-display text-lg leading-tight text-[#FF5A5A]">{notice.title}</p>
      <p className="mt-1 text-sm leading-snug text-white">{notice.body}</p>
      {notice.primary || notice.secondary ? (
        <div className="mt-3 flex flex-col gap-2">
          {notice.primary ? (
            <Button type="button" className="min-h-11 w-full bg-[#BEFF39] text-[#141618] hover:bg-[#d4ff6a]" onClick={() => onAction(notice.primary!.action)}>
              {notice.primary.label}
            </Button>
          ) : null}
          {notice.secondary ? (
            <Button type="button" variant="outline" className="min-h-11 w-full border-white/30 text-white" onClick={() => onAction(notice.secondary!.action)}>
              {notice.secondary.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function QuietButton({ children, onClick, pressed }: { children: ReactNode; onClick: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-white/80"
    >
      {children}
    </button>
  );
}

const JOIN_SANS = "var(--font-fp-sans), 'Segoe UI', sans-serif";
const JOIN_DISPLAY = "var(--font-fp-display), 'Arial Narrow', Impact, sans-serif";

function useVisibleFrame() {
  const [frame, setFrame] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const apply = () => {
      const viewport = window.visualViewport;
      setFrame({
        top: viewport?.offsetTop ?? 0,
        height: viewport?.height ?? window.innerHeight,
      });
    };
    apply();
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", apply);
    viewport?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    return () => {
      viewport?.removeEventListener("resize", apply);
      viewport?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
    };
  }, []);
  return frame;
}

export function JoinPanel({
  name,
  onName,
  error,
  joining,
  onSubmit,
}: {
  name: string;
  onName: (value: string) => void;
  error: string | null;
  joining: boolean;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const frame = useVisibleFrame();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fieldError = readyToPlayFieldError(error);

  useEffect(() => {
    if (document.activeElement?.id !== "name") return;
    buttonRef.current?.scrollIntoView({ block: "nearest" });
  }, [frame]);

  return (
    <form
      data-join-screen="name"
      className="absolute inset-x-0 overflow-y-auto bg-white text-[#14211A]"
      style={{
        top: frame?.top ?? 0,
        height: frame ? `${frame.height}px` : "100%",
        colorScheme: "light",
        fontFamily: JOIN_SANS,
      }}
      onSubmit={onSubmit}
    >
      <div className="mx-auto flex min-h-full w-full max-w-[24rem] flex-col pt-[max(1.75rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.25rem,env(safe-area-inset-bottom))] pl-[max(1.5rem,env(safe-area-inset-left))]">
        <img
          src="/marketing/playfit-club-logo.png"
          alt="PlayFit Club"
          width={851}
          height={178}
          className="mx-auto mt-3 h-auto w-[min(15.5rem,72vw)]"
        />
        <div className="mt-12">
          <h1
            className="text-center text-[2.65rem] leading-[0.95] text-[#14211A]"
            style={{ fontFamily: JOIN_DISPLAY, fontWeight: 700, letterSpacing: "-0.03em" }}
          >
            Ready to Play?
          </h1>
          <p className="mt-3 text-center text-[1.05rem] leading-snug text-[#14211A]">Enter your name to join the game.</p>
          <div className="mt-10">
            <label htmlFor="name" className="block text-sm font-semibold text-[#14211A]">
              Your Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(event) => onName(event.target.value)}
              onFocus={() => buttonRef.current?.scrollIntoView({ block: "nearest" })}
              placeholder="Enter your name"
              autoComplete="nickname"
              autoCapitalize="words"
              autoCorrect="off"
              enterKeyHint="go"
              maxLength={JOIN_NAME_MAX}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? "join-name-error" : undefined}
              className="mt-2 h-14 w-full scroll-mb-32 rounded-2xl border border-[#14211A]/15 bg-white px-4 text-base text-[#14211A] outline-none placeholder:text-[#14211A]/40 focus-visible:border-[#14211A] focus-visible:outline-[#14211A]"
            />
            {fieldError ? (
              <p id="join-name-error" role="alert" className="mt-2 text-sm leading-snug text-[#9b2c2c]">
                {fieldError}
              </p>
            ) : null}
          </div>
          <button
            ref={buttonRef}
            id="play-now"
            type="submit"
            disabled={joining}
            aria-busy={joining}
            className="mt-6 flex min-h-14 w-full scroll-mb-4 items-center justify-center rounded-2xl bg-[#BEFF39] px-6 text-base font-bold tracking-[0.08em] text-[#14211A] shadow-[0_10px_24px_rgba(190,255,57,0.35)] hover:bg-[#d4ff6a] disabled:cursor-not-allowed disabled:opacity-45"
          >
            PLAY NOW →
          </button>
        </div>
      </div>
    </form>
  );
}

export function CameraSetup({
  hint,
  notice,
  onAction,
  requesting,
  onEnable,
}: {
  hint: string;
  notice: PhoneNotice | null;
  onAction: (action: RecoveryAction) => void;
  requesting: boolean;
  onEnable: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <p className="max-w-full text-center text-sm leading-snug text-white/80">{hint}</p>
      {notice ? <PhoneAlert notice={notice} onAction={onAction} /> : null}
      <Button type="button" size="lg" className="min-h-14 w-full max-w-sm bg-[#BEFF39] text-[#141618] hover:bg-[#d4ff6a]" onClick={onEnable} disabled={requesting}>
        {requesting ? "Opening camera…" : "Enable Camera"}
      </Button>
    </div>
  );
}

export function TutorialCards({
  hit,
  confirmed,
}: {
  hit: string | null;
  confirmed: boolean;
}) {
  return (
    <div className="flex w-full max-w-full flex-col gap-2">
      <p className="text-center text-xs text-white/80">{confirmed ? "Confirmed. Practice stays on this phone." : "Practice stays on this phone."}</p>
      <div className="grid grid-cols-4 gap-1">
        {PRACTICE.map((move) => {
          const matched = hit === move.type;
          return (
            <div
              key={move.type}
              data-practice={move.type}
              data-hit={matched ? "1" : "0"}
              className={`min-w-0 rounded-xl border px-1 py-1 ${matched ? "border-[#BEFF39] bg-[#BEFF39]/15 text-[#BEFF39]" : "border-white/15 bg-[#141618]/80 text-white"}`}
            >
              <MoveIcon name={move.icon} />
              <p className="font-display text-[10px] leading-tight tracking-[0.04em]">{move.cue}</p>
              <p className="font-display text-[10px] leading-tight tracking-[0.04em] text-[#3df0ff]">{move.result}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PlayControls({
  paused,
  bodyOut,
  hideResume,
  onPause,
  onRecalibrate,
  onLeave,
}: {
  paused: boolean;
  bodyOut: boolean;
  hideResume?: boolean;
  onPause: () => void;
  onRecalibrate: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="flex w-full max-w-full items-center justify-between gap-2">
      {paused && hideResume ? (
        <p className="text-sm text-[#BEFF39]" role="status">Step Back Into Frame</p>
      ) : (
        <Button type="button" variant="outline" className="min-h-11 border-[#3df0ff] bg-black/50 text-white" disabled={bodyOut} onClick={onPause}>
          {paused ? "Resume" : "Pause"}
        </Button>
      )}
      <Button type="button" variant="outline" className="min-h-11 border-[#BEFF39] bg-black/50 text-white" onClick={onRecalibrate}>
        Recalibrate
      </Button>
      <button type="button" className="min-h-11 px-2 text-sm font-semibold text-[#FF5A5A]" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}

export function LeaveConfirm({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full rounded-3xl bg-[#141618] p-4 text-white" role="dialog" aria-labelledby="leave-title">
        <h2 id="leave-title" className="font-display text-2xl">Leave this game?</h2>
        <p className="mt-2 text-sm text-white/80">You can scan the code again to come back.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="min-h-11 border-white/30 text-white" onClick={onStay}>
            Stay
          </Button>
          <Button type="button" variant="danger" className="min-h-11" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DiagnosticsSheet({
  rows,
  events,
  onClose,
  onDownload,
}: {
  rows: Array<[string, string]>;
  events: string[];
  onClose: () => void;
  onDownload?: () => void;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 max-h-[70dvh] overflow-y-auto rounded-t-3xl bg-[#101216] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm text-white/80">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-display text-base tracking-[0.08em] text-white">Diagnostics</p>
        <div className="flex items-center gap-2">
          {onDownload ? (
            <button type="button" className="min-h-11 px-3 text-[#BEFF39]" onClick={onDownload}>
              Download log
            </button>
          ) : null}
          <button type="button" className="min-h-11 px-3 text-white" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <dl className="space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt>{label}</dt>
            <dd className="max-w-[60%] text-right text-white">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 font-display text-xs tracking-[0.12em] text-white">Events</p>
      <ul className="mt-1 space-y-1">
        {events.length === 0 ? <li>None yet</li> : events.map((event, index) => <li key={`${event}-${index}`}>{event}</li>)}
      </ul>
    </div>
  );
}

function MoveIcon({ name }: { name: "left" | "right" | "squat" | "jump" }) {
  return (
    <svg viewBox="0 0 48 48" className="h-6 w-6" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {name === "left" ? (
          <>
            <circle cx="20" cy="10" r="3" />
            <path d="M20 13v11M20 16 11 8M20 16l6 6M20 24l-4 10M20 24l4 10M36 24H28M32 20l-4 4 4 4" />
          </>
        ) : null}
        {name === "right" ? (
          <>
            <circle cx="28" cy="10" r="3" />
            <path d="M28 13v11M28 16l9-8M28 16l-6 6M28 24l-4 10M28 24l4 10M12 24h8M16 20l4 4-4 4" />
          </>
        ) : null}
        {name === "squat" ? (
          <>
            <circle cx="24" cy="12" r="3" />
            <path d="M24 15v7M24 18H16M24 18h8M24 22l-6 6v6M24 22l6 6v6" />
          </>
        ) : null}
        {name === "jump" ? (
          <>
            <circle cx="24" cy="8" r="3" />
            <path d="M24 11v9M24 15 16 12M24 15l8-3M24 20l-4 7M24 20l4 7M16 40h16" />
          </>
        ) : null}
      </g>
    </svg>
  );
}
