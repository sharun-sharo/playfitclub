"use client";

import { useEffect, useState } from "react";

interface Entry {
  score: number;
  displayName: string;
  gameName: string;
  createdAt: string;
  shareSlug: string;
}

type BoardState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error" }
  | { status: "ready"; entries: Entry[] };

export function ScoreBoard() {
  const [state, setState] = useState<BoardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(() => controller.abort(), 8000);
    void fetch("/api/leaderboard", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const body = (await response.json()) as { entries?: Entry[] };
        const entries = Array.isArray(body.entries) ? body.entries.filter((entry) => entry && typeof entry.score === "number") : [];
        if (!cancelled) setState(entries.length ? { status: "ready", entries: entries.slice(0, 5) } : { status: "empty" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="fp-board">
      <div className="fp-board-main">
        <p className="fp-kicker">Recorded scores</p>
        <h3>Public results from finished rounds</h3>
        <p className="fp-muted">Names and scores appear only when the app has stored them. This panel does not use sample players.</p>
        {state.status === "loading" ? <p className="fp-board-status">Looking up recorded scores…</p> : null}
        {state.status === "empty" ? <p className="fp-board-status">No public scores are stored yet.</p> : null}
        {state.status === "error" ? <p className="fp-board-status">The score list could not be loaded. No sample players are shown.</p> : null}
        {state.status === "ready" ? (
          <ol className="fp-board-list">
            {state.entries.map((entry) => (
              <li key={entry.shareSlug}>
                <a href={`/results/${entry.shareSlug}`}>
                  <span>{entry.displayName}</span>
                  <span>{entry.gameName}</span>
                  <strong>{entry.score.toLocaleString()}</strong>
                </a>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <ul className="fp-board-notes">
        <li>
          <span>Personal best</span>
          <p>Signed-in players can record one. This page does not show a personal score.</p>
        </li>
        <li>
          <span>Achievements</span>
          <p>They unlock after a signed-in round. None are previewed here.</p>
        </li>
        <li>
          <span>Session history</span>
          <p>Past sessions live on the account dashboard after sign-in.</p>
        </li>
        <li>
          <span>Daily challenge · upcoming</span>
          <p>A daily challenge is a concept only. It is not in the game.</p>
        </li>
      </ul>
    </div>
  );
}
