"use client";

import type { ResultsAccount } from "@/lib/fitrunner-v2/results-account";

export function GameOverScreen({
  score,
  coins,
  distanceM,
  obstaclesHit,
  saved,
  completedMissions,
  onAgain,
  onExit,
  accountLinks = null,
}: {
  score: number;
  coins: number;
  distanceM: number;
  obstaclesHit: number;
  saved: boolean | null;
  /** Missions that reached their target during this run. Omit on screens that do not track missions. */
  completedMissions?: ReadonlyArray<{ id: string; title: string }> | null;
  onAgain: () => void;
  onExit: () => void;
  /** Server session only. Null keeps Dashboard and History off the card. */
  accountLinks?: ResultsAccount | null;
}) {
  const rows: Array<[string, string]> = [
    ["Score", String(score)],
    ["Coins", String(coins)],
    ["Distance", `${Math.floor(distanceM)} m`],
    ["Obstacles hit", String(obstaclesHit)],
  ];
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#10141ce6] px-6" data-game-over="">
      <section className="w-full max-w-md rounded-3xl border border-white/15 bg-[#1c1f24] px-8 py-8 text-center shadow-2xl" aria-labelledby="fitrunner-game-over-title">
        <h2 id="fitrunner-game-over-title" className="font-display text-5xl text-[#ff5a6a]">
          GAME OVER
        </h2>
        <dl className="mt-6 grid grid-cols-[1fr_auto] gap-y-2 text-left text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-[#9aa8bd]">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {completedMissions ? (
          <div className="mt-5 text-left" data-completed-missions="">
            <p className="text-[10px] tracking-[0.18em] text-[#BEFF39]">COMPLETED THIS RUN</p>
            {completedMissions.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {completedMissions.map((mission) => (
                  <li key={mission.id}>{mission.title}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[#d5deea]">No daily missions completed this run.</p>
            )}
          </div>
        ) : null}
        {saved === true ? <p className="mt-4 text-xs text-[#9aa8bd]">Saved to your account.</p> : null}
        {saved === false ? <p className="mt-4 text-xs text-[#9aa8bd]">Not saved. Sign in to keep this workout.</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" className="rounded-full bg-[#BEFF39] px-5 py-2 text-sm font-semibold text-[#1c1f24]" onClick={onAgain}>
            Play Again
          </button>
          {accountLinks === "individual" || accountLinks === "gym" ? (
            <>
              <a className="rounded-full border border-white/15 px-5 py-2 text-sm" href="/dashboard">
                Dashboard
              </a>
              <a className="rounded-full border border-white/15 px-5 py-2 text-sm" href="/dev/fitrunner-v2/history">
                History
              </a>
            </>
          ) : null}
          <button type="button" className="rounded-full border border-white/15 px-5 py-2 text-sm" onClick={onExit}>
            Exit
          </button>
        </div>
      </section>
    </div>
  );
}
