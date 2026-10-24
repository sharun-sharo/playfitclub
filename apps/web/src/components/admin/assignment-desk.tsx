"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

interface GymRow {
  id: string;
  name: string;
  status: string;
  owner: { displayName: string; email: string | null };
  seatLimit: number | null;
  occupied: number;
  subscription: { status: string; plan: string; startsAt: string; endsAt: string } | null;
}

interface GymDetail extends GymRow {
  players: Array<{ userId: string; displayName: string; email: string | null; assignedAt: string }>;
}

interface PlayerRow {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  gymId: string | null;
  gymName: string | null;
  membershipStatus: string;
}

interface HistoryRow {
  id: string;
  gymName: string;
  status: string;
  role: string;
  assignedAt: string;
  endedAt: string | null;
  assignedBy: string | null;
}

type Confirm = { action: "assign" | "transfer" | "unassign"; userId: string; name: string; gymId: string; gymName: string };

function showPhone(phone: string | null) {
  if (!phone) return "No phone yet";
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone);
  if (!match) return phone;
  return `+91 ${match[1]} ${match[2]}`;
}

export function AssignmentDesk() {
  const [gyms, setGyms] = useState<GymRow[]>([]);
  const [gym, setGym] = useState<GymDetail | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [selected, setSelected] = useState<PlayerRow | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  function loadGyms() {
    setLoading(true);
    void fetch("/api/admin/assignments").then(async (response) => {
      const body = (await response.json()) as { gyms?: GymRow[]; message?: string };
      if (!response.ok) setError(body.message ?? "Gyms could not be loaded.");
      else {
        setError("");
        setGyms(body.gyms ?? []);
      }
      setLoading(false);
    }).catch(() => {
      setError("Gyms could not be loaded.");
      setLoading(false);
    });
  }

  function loadPlayers(nextQuery = query, nextPage = page) {
    const params = new URLSearchParams({ q: nextQuery, page: String(nextPage), pageSize: "20" });
    void fetch(`/api/admin/assignments/players?${params.toString()}`).then(async (response) => {
      const body = (await response.json()) as { players?: PlayerRow[]; total?: number; message?: string };
      if (!response.ok) setError(body.message ?? "Players could not be loaded.");
      else {
        setPlayers(body.players ?? []);
        setTotal(body.total ?? 0);
      }
    });
  }

  function openGym(id: string) {
    void fetch(`/api/admin/assignments/gyms/${id}`).then(async (response) => {
      const body = (await response.json()) as { gym?: GymDetail; message?: string };
      if (!response.ok) setError(body.message ?? "That gym could not be opened.");
      else setGym(body.gym ?? null);
    });
  }

  function openPlayer(player: PlayerRow) {
    setSelected(player);
    void fetch(`/api/admin/assignments/players/${player.id}`).then(async (response) => {
      const body = (await response.json()) as { history?: HistoryRow[] };
      setHistory(body.history ?? []);
    });
  }

  useEffect(() => {
    loadGyms();
    loadPlayers("", 1);
  }, []);

  function submit() {
    if (!confirm) return;
    void fetch("/api/admin/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: confirm.action, userId: confirm.userId, gymId: confirm.gymId }),
    }).then(async (response) => {
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? "The assignment could not be saved.");
        return;
      }
      setError("");
      setNotice(confirm.action === "unassign" ? `${confirm.name} is now an individual player.` : `${confirm.name} is assigned to ${confirm.gymName}. Past workouts stay on their original gym.`);
      setConfirm(null);
      loadGyms();
      loadPlayers();
      if (gym) openGym(gym.id);
      if (selected) openPlayer(selected);
    });
  }

  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page fp-console">
        <p className="fp-kicker">Super Admin</p>
        <h1 className="fp-title-wide">Gym assignments</h1>
        <nav className="fp-actions" aria-label="Admin">
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/admin">Overview</Link>
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/admin/gyms">Gyms</Link>
          <Link className="fp-btn fp-btn-ghost fp-btn-sm" href="/admin/users">Users</Link>
        </nav>
        {loading ? <p className="fp-status">Loading gyms…</p> : null}
        {error ? <p className="fp-error">{error}</p> : null}
        {notice ? <p className="fp-success">{notice}</p> : null}
        <section className="fp-split-cards">
          <article className="fp-card">
            <h2>Gyms</h2>
            {gyms.length === 0 && !loading ? <p className="fp-muted">No gyms yet.</p> : null}
            <ul className="fp-stack">
              {gyms.map((item) => (
                <li key={item.id}>
                  <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => openGym(item.id)}>{item.name}</button>
                  <p className="fp-status">{item.status} · {item.occupied} players{item.seatLimit === null ? " · no seat allocation" : ` · limit ${item.seatLimit}`}</p>
                </li>
              ))}
            </ul>
          </article>
          <article className="fp-card">
            <h2>{gym ? gym.name : "Gym detail"}</h2>
            {!gym ? <p className="fp-muted">Choose a gym to see its owner, subscription, and active players.</p> : null}
            {gym ? (
              <>
                <p className="fp-status">Owner {gym.owner.displayName} · {gym.owner.email ?? "no email"}</p>
                <p className="fp-status">
                  Subscription {gym.subscription ? `${gym.subscription.plan} · ${gym.subscription.status} · ${gym.subscription.startsAt.slice(0, 10)} to ${gym.subscription.endsAt.slice(0, 10)}` : "No subscription row. The gym flag is " + gym.status + "."}
                </p>
                <p className="fp-status">Capacity {gym.occupied} of {gym.seatLimit ?? "unallocated"}</p>
                <ul className="fp-stack">
                  {gym.players.length === 0 ? <li className="fp-muted">No active players.</li> : null}
                  {gym.players.map((player) => (
                    <li key={player.userId} className="fp-list-row">
                      <span>{player.displayName}</span>
                      <span className="fp-muted">{player.assignedAt.slice(0, 10)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </article>
        </section>
        <section className="fp-card">
          <h2>Players</h2>
          <form className="fp-form" onSubmit={(event) => { event.preventDefault(); setPage(1); loadPlayers(query, 1); }}>
            <div className="fp-field">
              <label htmlFor="player-search">Search by name, phone, or email</label>
              <input id="player-search" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <button className="fp-btn fp-btn-ghost" type="submit">Search</button>
          </form>
          {players.length === 0 ? <p className="fp-muted">No matching players.</p> : null}
          <ul className="fp-stack">
            {players.map((player) => (
              <li key={player.id} className="fp-list-card">
                <h3>{player.displayName}</h3>
                <p className="fp-status">{showPhone(player.phone)} · {player.gymName ? player.gymName : "Individual player"}</p>
                <div className="fp-actions">
                  <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => openPlayer(player)}>History</button>
                  <button type="button" className="fp-btn fp-btn-primary fp-btn-sm" disabled={!gym} onClick={() => gym && setConfirm({ action: player.gymId && player.gymId !== gym.id ? "transfer" : "assign", userId: player.id, name: player.displayName, gymId: gym.id, gymName: gym.name })}>Assign to gym</button>
                  <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" disabled={!player.gymId} onClick={() => player.gymId && setConfirm({ action: "unassign", userId: player.id, name: player.displayName, gymId: player.gymId, gymName: player.gymName ?? "the gym" })}>Unassign</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="fp-actions">
            <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" disabled={page <= 1} onClick={() => { const next = page - 1; setPage(next); loadPlayers(query, next); }}>Previous</button>
            <span className="fp-status">Page {page} · {total} players</span>
            <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" disabled={page * 20 >= total} onClick={() => { const next = page + 1; setPage(next); loadPlayers(query, next); }}>Next</button>
          </div>
          {selected ? (
            <>
              <h3>{selected.displayName} history</h3>
              {history.length === 0 ? <p className="fp-muted">No membership history.</p> : null}
              <ul className="fp-stack">
                {history.map((row) => (
                  <li key={row.id} className="fp-list-row">
                    <span>{row.gymName} · {row.status}</span>
                    <span className="fp-muted">{row.assignedAt.slice(0, 10)}{row.endedAt ? ` – ${row.endedAt.slice(0, 10)}` : ""}{row.assignedBy ? ` · ${row.assignedBy}` : ""}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        {confirm ? (
          <dialog className="fp-dialog" open>
            <h2>{confirm.action === "unassign" ? "Unassign player" : confirm.action === "transfer" ? "Transfer player" : "Assign to gym"}</h2>
            <p>
              {confirm.action === "unassign"
                ? `Remove ${confirm.name} from ${confirm.gymName}? Saved workouts stay on that gym. New workouts stay individual until the next assignment.`
                : `Assign ${confirm.name} to ${confirm.gymName}? Workouts already saved stay on their original gym. Workouts that finish after this change count for ${confirm.gymName}.`}
            </p>
            <div className="fp-actions">
              <button type="button" className="fp-btn fp-btn-primary" onClick={submit}>Confirm</button>
              <button type="button" className="fp-btn fp-btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
            </div>
          </dialog>
        ) : null}
      </main>
    </AppShell>
  );
}
