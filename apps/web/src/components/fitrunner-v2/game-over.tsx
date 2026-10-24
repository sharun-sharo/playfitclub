"use client";

export function GameOverScreen({
  score,
  coins,
  distanceM,
  obstaclesHit,
  saved,
  onAgain,
  onExit,
}: {
  score: number;
  coins: number;
  distanceM: number;
  obstaclesHit: number;
  saved: boolean | null;
  onAgain: () => void;
  onExit: () => void;
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
        {saved === true ? <p className="mt-4 text-xs text-[#9aa8bd]">Saved to your account.</p> : null}
        {saved === false ? <p className="mt-4 text-xs text-[#9aa8bd]">Not saved. Sign in to keep this workout.</p> : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" className="rounded-full bg-[#BEFF39] px-5 py-2 text-sm font-semibold text-[#1c1f24]" onClick={onAgain}>
            Play Again
          </button>
          <button type="button" className="rounded-full border border-white/15 px-5 py-2 text-sm" onClick={onExit}>
            Exit
          </button>
        </div>
      </section>
    </div>
  );
}
