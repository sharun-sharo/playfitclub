"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

interface ResultView {
  displayName: string;
  gameName: string;
  score: number;
  movementsCompleted: number;
  misses: number;
  personalBest: boolean;
}

export function SharedResult({ shareSlug }: { shareSlug: string }) {
  const [result, setResult] = useState<ResultView | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void fetch(`/api/results/${shareSlug}`).then(async (response) => {
      if (!response.ok) {
        setMissing(true);
        return;
      }
      const body = (await response.json()) as { result: ResultView };
      setResult(body.result);
    });
  }, [shareSlug]);

  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page">
        {missing ? <p className="fp-muted">This result is not available.</p> : null}
        {result ? (
          <>
            <p className="fp-kicker">{result.gameName}</p>
            <h1>{result.score}</h1>
            <p className="fp-lead">{result.displayName}</p>
            <p className="fp-status">{result.movementsCompleted} successful movements · {result.misses} misses{result.personalBest ? " · personal best" : ""}</p>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
