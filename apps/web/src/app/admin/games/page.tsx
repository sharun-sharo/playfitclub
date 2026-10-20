"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

interface GameRow { id: string; name: string; slug: string; enabled: boolean; plays: number }

export default function AdminGamesPage() {
  const [games, setGames] = useState<GameRow[]>([]);
  function load() {
    void fetch("/api/admin/overview").then(async (response) => {
      const body = (await response.json()) as { games: GameRow[] };
      setGames(body.games ?? []);
    });
  }
  useEffect(() => { load(); }, []);
  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page">
        <Link className="fp-text-link" href="/admin">Back to control</Link>
        <h1>Games</h1>
        <ul className="fp-stack">
          {games.map((game) => (
            <li key={game.id} className="fp-list-card">
              <h2>{game.name}</h2>
              <p className="fp-status">{game.plays} sessions</p>
              <div className="fp-inline-actions">
                <button
                  type="button"
                  className={game.enabled ? "fp-btn fp-btn-primary fp-btn-sm" : "fp-btn fp-btn-ghost fp-btn-sm"}
                  onClick={() => void fetch(`/api/admin/games/${game.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !game.enabled }) }).then(load)}
                >
                  {game.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>
    </AppShell>
  );
}
