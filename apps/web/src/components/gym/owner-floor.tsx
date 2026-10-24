"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ScoreBoardPanel, type BoardEntry } from "@/components/gym/score-board-panel";

interface Floor {
  gym: {
    name: string;
    status: string;
    ownerName: string;
    seatLimit: number | null;
    occupied: number;
    subscription: { status: string; plan: string; startsAt: string; endsAt: string } | null;
  };
  games: Array<{ id: string; name: string; slug: string }>;
  recent: Array<{ id: string; displayName: string; score: number; xp: number; completedAt: string | null }>;
}

interface DirectoryPlayer {
  id: string;
  displayName: string;
  assignedAt: string;
  status: string;
  lastActivity: string | null;
  sessions: number;
  bestScore: number;
  xp: number;
  rank: number | null;
}

export function OwnerFloor() {
  const [floor, setFloor] = useState<Floor | null>(null);
  const [players, setPlayers] = useState<DirectoryPlayer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("active");
  const [period, setPeriod] = useState("week");
  const [game, setGame] = useState("overall");
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [floorState, setFloorState] = useState<"loading" | "error" | "ready">("loading");
  const [directoryState, setDirectoryState] = useState<"loading" | "error" | "ready">("loading");
  const [boardState, setBoardState] = useState<"loading" | "error" | "ready">("loading");
  const [message, setMessage] = useState("");

  function loadDirectory(nextPage = page, nextQuery = query, nextFilter = filter) {
    setDirectoryState("loading");
    const params = new URLSearchParams({ q: nextQuery, filter: nextFilter, page: String(nextPage), pageSize: "20" });
    void fetch(`/api/gym/directory?${params.toString()}`).then(async (response) => {
      const body = (await response.json()) as { players?: DirectoryPlayer[]; total?: number; message?: string };
      if (!response.ok) {
        setDirectoryState("error");
        setMessage(body.message ?? "The player directory could not be loaded.");
        return;
      }
      setPlayers(body.players ?? []);
      setTotal(body.total ?? 0);
      setDirectoryState("ready");
    }).catch(() => setDirectoryState("error"));
  }

  function loadBoard(nextPeriod = period, nextGame = game) {
    setBoardState("loading");
    const params = new URLSearchParams({ period: nextPeriod, game: nextGame });
    void fetch(`/api/gym/leaderboard?${params.toString()}`).then(async (response) => {
      const body = (await response.json()) as { leaderboard?: BoardEntry[]; message?: string };
      if (!response.ok) {
        setBoardState("error");
        setMessage(body.message ?? "The leaderboard could not be loaded.");
        return;
      }
      setBoard(body.leaderboard ?? []);
      setBoardState("ready");
    }).catch(() => setBoardState("error"));
  }

  useEffect(() => {
    void fetch("/api/gym/floor").then(async (response) => {
      const body = (await response.json()) as Floor & { message?: string };
      if (!response.ok) {
        setFloorState("error");
        setMessage(body.message ?? "This gym floor is not available.");
        return;
      }
      setFloor(body);
      setFloorState("ready");
    }).catch(() => setFloorState("error"));
    loadDirectory(1, "", "active");
    loadBoard("week", "overall");
  }, []);

  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page">
        <p className="fp-kicker">Gym</p>
        <h1 className="fp-title-wide">{floor?.gym.name ?? "Your gym"}</h1>
        <nav className="fp-actions" aria-label="Account">
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/dashboard">Account</Link>
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/dashboard/settings">Settings</Link>
        </nav>
        {message ? <p className="fp-error">{message}</p> : null}
        {floorState === "loading" ? <p className="fp-status">Loading the gym…</p> : null}
        {floorState === "error" ? <p className="fp-error">The gym profile could not be loaded.</p> : null}
        {floor ? (
          <section className="fp-stats">
            <article className="fp-stat"><p className="fp-kicker">Owner</p><strong>{floor.gym.ownerName}</strong></article>
            <article className="fp-stat"><p className="fp-kicker">Subscription</p><strong>{floor.gym.subscription?.status ?? floor.gym.status}</strong></article>
            <article className="fp-stat"><p className="fp-kicker">Capacity</p><strong>{floor.gym.occupied}/{floor.gym.seatLimit ?? "—"}</strong></article>
            <article className="fp-stat"><p className="fp-kicker">Window</p><strong>{floor.gym.subscription ? `${floor.gym.subscription.startsAt.slice(0, 10)} – ${floor.gym.subscription.endsAt.slice(0, 10)}` : floor.gym.status}</strong></article>
          </section>
        ) : null}
        <section className="fp-card">
          <h2>Players</h2>
          <form className="fp-form" onSubmit={(event) => { event.preventDefault(); setPage(1); loadDirectory(1, query, filter); }}>
            <div className="fp-form-grid">
              <div className="fp-field">
                <label htmlFor="directory-search">Search by name</label>
                <input id="directory-search" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              <div className="fp-field">
                <label htmlFor="directory-filter">Membership</label>
                <select id="directory-filter" value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="active">Active</option>
                  <option value="ended">Ended</option>
                </select>
              </div>
            </div>
            <button className="fp-btn fp-btn-ghost" type="submit">Filter</button>
          </form>
          {directoryState === "loading" ? <p className="fp-status">Loading players…</p> : null}
          {directoryState === "error" ? <p className="fp-error">The player directory could not be loaded.</p> : null}
          {directoryState === "ready" && players.length === 0 ? <p className="fp-muted">No players in this view.</p> : null}
          <div className="fp-directory">
            {players.map((player) => (
              <article key={player.id} className="fp-list-card">
                <h3>{player.displayName}</h3>
                <p className="fp-status">{player.id}</p>
                <p className="fp-status">Assigned {player.assignedAt.slice(0, 10)} · {player.status}</p>
                <p className="fp-status">Last activity {player.lastActivity ? player.lastActivity.slice(0, 10) : "none"} · {player.sessions} sessions</p>
                <p className="fp-status">Best {player.bestScore} · {player.xp} gym XP · rank {player.rank ?? "—"}</p>
              </article>
            ))}
          </div>
          <div className="fp-actions">
            <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" disabled={page <= 1} onClick={() => { const next = page - 1; setPage(next); loadDirectory(next); }}>Previous</button>
            <span className="fp-status">Page {page} · {total}</span>
            <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" disabled={page * 20 >= total} onClick={() => { const next = page + 1; setPage(next); loadDirectory(next); }}>Next</button>
          </div>
        </section>
        <section className="fp-card">
          <h2>Leaderboard</h2>
          <div className="fp-board-tabs" role="tablist" aria-label="Period">
            {(["day", "week", "month", "all"] as const).map((item) => (
              <button key={item} type="button" className={period === item ? "fp-btn fp-btn-primary fp-btn-sm" : "fp-btn fp-btn-ghost fp-btn-sm"} onClick={() => { setPeriod(item); loadBoard(item, game); }}>{item === "all" ? "All time" : item}</button>
            ))}
          </div>
          <div className="fp-field">
            <label htmlFor="game-filter">Game</label>
            <select id="game-filter" value={game} onChange={(event) => { setGame(event.target.value); loadBoard(period, event.target.value); }}>
              <option value="overall">Overall</option>
              {floor?.games.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
            </select>
          </div>
          <ScoreBoardPanel entries={board} status={boardState} />
        </section>
        <section className="fp-card">
          <h2>Recent workouts</h2>
          {floor && floor.recent.length === 0 ? <p className="fp-muted">No saved gym workouts yet.</p> : null}
          <ul className="fp-stack">
            {floor?.recent.map((row) => (
              <li key={row.id} className="fp-list-row">
                <span>{row.displayName}</span>
                <span>{row.score} · {row.xp} XP</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </AppShell>
  );
}
