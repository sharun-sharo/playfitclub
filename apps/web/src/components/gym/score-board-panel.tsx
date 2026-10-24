"use client";

export interface BoardEntry {
  rank: number;
  displayName: string;
  xp: number;
  bestScore: number;
}

export function ScoreBoardPanel({
  entries,
  status,
}: {
  entries: BoardEntry[];
  status: "loading" | "error" | "ready";
}) {
  if (status === "loading") return <p className="fp-status">Loading the gym board…</p>;
  if (status === "error") return <p className="fp-error">The gym board could not be loaded.</p>;
  if (entries.length === 0) return <p className="fp-status">No gym-attributed workouts in this window yet.</p>;
  const podium = entries.slice(0, 3);
  return (
    <>
      <ol className="fp-podium">
        {podium.map((entry) => (
          <li key={`${entry.rank}-${entry.displayName}`}>
            <span className="fp-kicker">#{entry.rank}</span>
            <strong>{entry.displayName}</strong>
            <span>{entry.xp} XP</span>
            <span className="fp-muted">Best {entry.bestScore}</span>
          </li>
        ))}
      </ol>
      <ol className="fp-stack">
        {entries.map((entry) => (
          <li key={`${entry.rank}-${entry.displayName}-row`} className="fp-list-row">
            <span>{entry.rank}. {entry.displayName}</span>
            <span>{entry.xp} XP · best {entry.bestScore}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
