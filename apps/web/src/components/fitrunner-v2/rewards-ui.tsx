"use client";

import { CALORIE_LABEL } from "@/lib/fitrunner-v2/calories";
import type { GradePopup } from "@/lib/fitrunner-v2/combo";
import { formatKolkataCountdown } from "@/lib/fitrunner-v2/missions";
import type { ResultsAccount } from "@/lib/fitrunner-v2/results-account";

export type MissionCard = {
  id: string;
  templateKey?: string;
  title: string;
  progress: number;
  target: number;
  xp: number;
  claimed: boolean;
};

export type MissionBoard = {
  dayKey: string;
  resetsInMs: number;
  missions: MissionCard[];
};

export type MissionLoadError = {
  status: number;
  message: string;
};

export type RunResult = {
  saved: boolean;
  durationMs: number;
  activeMs: number;
  distanceM: number;
  score: number;
  tokens: number;
  jumps: number;
  squats: number;
  laneDodges: number;
  perfects: number;
  bestCombo: number;
  missionsDone: number | null;
  xp: number | null;
  calories: number | null;
  achievements?: Array<{ key: string; title: string }>;
};

const panel = "rounded-2xl border border-white/10 bg-[#1c1f24] text-white shadow-xl";

export function playGradeBlip(grade: GradePopup["grade"]) {
  const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;
  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = grade === "PERFECT" ? 880 : grade === "GREAT" ? 698 : grade === "GOOD" ? 523 : 196;
  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.045, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.1);
  oscillator.onended = () => void context.close().catch(() => undefined);
}

export function ComboMeter({ multiplier, best }: { multiplier: number; best: number }) {
  const filled = Math.max(0, Math.min(5, multiplier));
  return (
    <div className="mt-3" data-combo-meter="">
      <div className="flex items-center justify-between text-[10px] tracking-[0.14em] text-[#BEFF39]">
        <span>{filled > 0 ? `COMBO x${filled}` : "COMBO"}</span>
        <span>{best > 0 ? `BEST x${best}` : "BEST —"}</span>
      </div>
      <div className="mt-1 flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((pip) => (
          <span key={pip} className={`h-1.5 flex-1 rounded-full ${pip <= filled ? "bg-[#BEFF39]" : "bg-white/15"}`} />
        ))}
      </div>
    </div>
  );
}

export function GradePopup(_grade: { grade: GradePopup | null }) {
  return null;
}

export function MissionToast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p data-mission-toast="" className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#1c1f24] px-4 py-2 text-xs text-[#BEFF39]">
      {text}
    </p>
  );
}

export function MissionPanel({
  auth,
  board,
  error,
  onRetry,
  onClaim,
}: {
  auth: "unknown" | "in" | "out";
  board: MissionBoard | null;
  error: MissionLoadError | null;
  onRetry: () => void;
  onClaim: (id: string) => void;
}) {
  const loading = auth !== "out" && !board && !error;
  return (
    <section className={`pointer-events-auto absolute left-[15.5rem] top-4 z-10 w-72 p-4 ${panel}`} data-mission-panel="" data-mission-state={auth === "out" ? "signed-out" : error ? "error" : board ? "ready" : "loading"}>
      <p className="text-[10px] tracking-[0.18em] text-[#BEFF39]">DAILY MISSIONS</p>
      {auth === "out" ? (
        <p className="mt-2 text-sm text-[#d5deea]">
          Sign in to track today’s missions.{" "}
          <a className="text-[#BEFF39] underline" href="/login?next=/dev/fitrunner-v2">
            Sign in
          </a>
        </p>
      ) : null}
      {auth !== "out" && error ? (
        <p className="mt-2 text-sm text-[#d5deea]">
          Could not load missions{error.status > 0 ? ` (${error.status})` : ""}. {error.message}{" "}
          <button type="button" className="text-[#BEFF39] underline" onClick={onRetry}>
            Retry
          </button>
        </p>
      ) : null}
      {loading ? <p className="mt-2 text-sm text-[#9aa8bd]">Loading missions…</p> : null}
      {board ? (
        <>
          <p className="mt-1 text-[11px] text-[#9aa8bd]">Resets in {formatKolkataCountdown(board.resetsInMs)}</p>
          <ul className="mt-3 space-y-3">
            {board.missions.map((mission) => {
              const width = Math.min(100, Math.round((mission.progress / Math.max(1, mission.target)) * 100));
              return (
                <li key={mission.id}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span>{mission.title}</span>
                    <span className="text-[#BEFF39]">{mission.templateKey === "triple_victory" ? `${mission.xp} bonus XP` : `${mission.xp} XP`}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/40">
                    <div className="h-full bg-[#BEFF39]" style={{ width: `${width}%` }} />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-[#9aa8bd]">
                    <span>
                      {Math.min(mission.progress, mission.target)}/{mission.target}
                    </span>
                    {mission.claimed ? <span>Claimed</span> : mission.progress >= mission.target ? (
                      <button type="button" className="rounded-full bg-[#BEFF39] px-2 py-0.5 text-[11px] font-semibold text-[#1c1f24]" onClick={() => onClaim(mission.id)}>
                        Claim
                      </button>
                    ) : <span>In progress</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

export function ResultsScreen({
  result,
  onAgain,
  accountLinks = null,
}: {
  result: RunResult;
  onAgain: () => void;
  /** Server session only. Null keeps Dashboard and History off the card. */
  accountLinks?: ResultsAccount | null;
}) {
  const rows: Array<[string, string]> = [
    ["Duration", clock(result.durationMs)],
    ["Active time", clock(result.activeMs)],
    ["Distance", `${Math.floor(result.distanceM)} m`],
    ["Score", String(result.score)],
    ["Tokens", String(result.tokens)],
    ["Jumps", String(result.jumps)],
    ["Squats", String(result.squats)],
    ["Lane dodges", String(result.laneDodges)],
    ["Perfects", String(result.perfects)],
    ["Best combo", result.bestCombo > 0 ? `x${result.bestCombo}` : "—"],
    ["Missions completed", result.missionsDone === null ? "—" : String(result.missionsDone)],
    ["XP", result.xp === null ? "—" : String(result.xp)],
    ["Estimated calories", result.calories === null ? "Calories unavailable" : String(result.calories)],
  ];
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#101318cc] p-4" data-results-screen="">
      <section className={`${panel} max-h-[90vh] w-full max-w-md overflow-auto p-6`}>
        <p className="text-[10px] tracking-[0.18em] text-[#BEFF39]">WORKOUT</p>
        <h2 className="mt-1 font-display text-3xl">Results</h2>
        <p className="mt-1 text-xs text-[#9aa8bd]">{result.saved ? "Saved to your account." : "Not saved. Sign in to keep this workout."}</p>
        <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-[#9aa8bd]">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-[#9aa8bd]">{CALORIE_LABEL}</p>
        {result.achievements && result.achievements.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {result.achievements.map((item) => (
              <li key={item.key} className="rounded-full border border-[#BEFF39]/40 px-2 py-1 text-[11px] text-[#BEFF39]">
                {item.title}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="rounded-full bg-[#BEFF39] px-4 py-2 text-sm font-semibold text-[#1c1f24]" onClick={onAgain}>
            Play Again
          </button>
          {accountLinks === "individual" || accountLinks === "gym" ? (
            <>
              <a className="rounded-full border border-white/15 px-4 py-2 text-sm" href="/dashboard">
                Dashboard
              </a>
              <a className="rounded-full border border-white/15 px-4 py-2 text-sm" href="/dev/fitrunner-v2/history">
                History
              </a>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
