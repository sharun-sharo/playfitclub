"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

interface AdminData {
  overview: { users: number; gyms: number; sessions: number; live: number; resultsLastDay: number; errors: Array<{ id: string; level: string; source: string; message: string; createdAt: string }> };
  gyms: Array<{ id: string; name: string; slug: string; subscriptionStatus: string; sessions: number; ownerName: string }>;
  users: Array<{ id: string; email: string | null; displayName: string; role: string }>;
  sessions: Array<{ id: string; joinCode: string; status: string; gameName: string; gymName: string | null; players: number }>;
  flags: Array<{ key: string; enabled: boolean; description: string }>;
  games: Array<{ id: string; name: string; slug: string; enabled: boolean; plays: number }>;
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [health, setHealth] = useState<{ database: boolean; realtime: boolean } | null>(null);
  const [error, setError] = useState("");

  function load() {
    void fetch("/api/admin/overview").then(async (response) => {
      if (!response.ok) {
        setError("Admin data is unavailable.");
        return;
      }
      setData(await response.json());
    });
    void fetch("/api/health").then(async (response) => setHealth(await response.json()));
  }

  useEffect(() => { load(); }, []);

  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page">
        <p className="fp-kicker">Operations</p>
        <h1 className="fp-title-wide">PlayFit Club control</h1>
        {error ? <p className="fp-error">{error}</p> : null}
        <div className="fp-stats">
          <Stat label="Players" value={data?.overview.users} />
          <Stat label="Gyms" value={data?.overview.gyms} />
          <Stat label="Sessions" value={data?.overview.sessions} />
          <Stat label="Results today" value={data?.overview.resultsLastDay} />
        </div>
        <p className="fp-status">
          Database {health?.database ? "up" : "down"} · Realtime {health?.realtime ? "up" : "down"} · Open sessions {data?.overview.live ?? 0}
        </p>
        <div className="fp-actions">
          <Link className="fp-btn fp-btn-ghost" href="/admin/gyms">Gyms</Link>
          <Link className="fp-btn fp-btn-ghost" href="/admin/games">Games</Link>
        </div>
        <section className="fp-split-cards">
          <article className="fp-card">
            <h2>Feature flags</h2>
            <ul className="fp-flags">
              {data?.flags.map((flag) => (
                <li key={flag.key} className="fp-flag">
                  <span>
                    <strong>{flag.key}</strong>
                    <span className="fp-muted">{flag.description}</span>
                  </span>
                  <button
                    type="button"
                    className={flag.enabled ? "fp-btn fp-btn-primary fp-btn-sm" : "fp-btn fp-btn-ghost fp-btn-sm"}
                    onClick={() => void fetch(`/api/admin/flags/${flag.key}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !flag.enabled }) }).then(load)}
                  >
                    {flag.enabled ? "On" : "Off"}
                  </button>
                </li>
              ))}
            </ul>
          </article>
          <article className="fp-card">
            <h2>Recent errors</h2>
            <ul className="fp-errors">
              {data?.overview.errors.length === 0 ? <li className="fp-muted">No operational errors recorded.</li> : null}
              {data?.overview.errors.map((event) => (
                <li key={event.id} className="fp-list-row">{event.level} · {event.source} · {event.message}</li>
              ))}
            </ul>
          </article>
        </section>
      </main>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <article className="fp-stat">
      <p className="fp-kicker">{label}</p>
      <strong>{value ?? "—"}</strong>
    </article>
  );
}
