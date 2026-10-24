"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

interface BillingCounts {
  users: number;
  gyms: number;
  activeIndividualSubs: number;
  activeGymSubs: number;
  expired: number;
  expiringIn7Days: number;
  expiringIn30Days: number;
  allocatedSeats: number;
  occupiedSeats: number;
  recordedRevenueInr: number;
  pendingPayments: number;
}

interface AdminData {
  billing: BillingCounts | null;
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
      <main id="content" className="fp-wrap fp-page fp-console">
        <p className="fp-kicker">Super Admin</p>
        <h1 className="fp-title-wide">PlayFit Club control</h1>
        {error ? <p className="fp-error">{error}</p> : null}
        <div className="fp-stats">
          <Stat label="Users" value={data?.billing?.users} />
          <Stat label="Gyms" value={data?.billing?.gyms} />
          <Stat label="Active individual subs" value={data?.billing?.activeIndividualSubs} />
          <Stat label="Active gym subs" value={data?.billing?.activeGymSubs} />
          <Stat label="Expired" value={data?.billing?.expired} />
          <Stat label="Expiring in 7 days" value={data?.billing?.expiringIn7Days} />
          <Stat label="Expiring in 30 days" value={data?.billing?.expiringIn30Days} />
          <Stat label="Allocated seats" value={data?.billing?.allocatedSeats} />
          <Stat label="Occupied seats" value={data?.billing?.occupiedSeats} />
          <Stat label="Recorded revenue INR" value={data?.billing?.recordedRevenueInr} />
          <Stat label="Pending payments" value={data?.billing?.pendingPayments} />
        </div>
        <p className="fp-status">
          Database {health?.database ? "up" : "down"} · Realtime {health?.realtime ? "up" : "down"} · Open sessions {data?.overview.live ?? 0}
        </p>
        <div className="fp-actions">
          <Link className="fp-btn fp-btn-ghost" href="/admin/users">Users</Link>
          <Link className="fp-btn fp-btn-ghost" href="/admin/gyms">Gyms</Link>
          <Link className="fp-btn fp-btn-ghost" href="/admin/assignments">Assignments</Link>
          <Link className="fp-btn fp-btn-ghost" href="/admin/subscriptions">Subscriptions</Link>
          <Link className="fp-btn fp-btn-ghost" href="/admin/payments">Payments</Link>
          <Link className="fp-btn fp-btn-ghost" href="/admin/games">Games</Link>
          <Link className="fp-btn fp-btn-ghost" href="/admin/analytics">Analytics</Link>
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
