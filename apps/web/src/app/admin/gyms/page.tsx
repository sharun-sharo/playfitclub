"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

interface GymRow { id: string; name: string; slug: string; subscriptionStatus: "ACTIVE" | "TRIALING" | "EXPIRED"; sessions: number; ownerName: string; ownerEmail: string | null }

export default function AdminGymsPage() {
  const [gyms, setGyms] = useState<GymRow[]>([]);

  function load() {
    void fetch("/api/admin/overview").then(async (response) => {
      const body = (await response.json()) as { gyms: GymRow[] };
      setGyms(body.gyms ?? []);
    });
  }
  useEffect(() => { load(); }, []);

  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page">
        <Link className="fp-text-link" href="/admin">Back to control</Link>
        <h1>Gyms</h1>
        <ul className="fp-stack">
          {gyms.map((gym) => (
            <li key={gym.id} className="fp-list-card">
              <h2>{gym.name}</h2>
              <p className="fp-status">{gym.ownerName} · {gym.sessions} sessions · {gym.subscriptionStatus}</p>
              <div className="fp-inline-actions">
                {(["ACTIVE", "TRIALING", "EXPIRED"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={gym.subscriptionStatus === status ? "fp-btn fp-btn-primary fp-btn-sm" : "fp-btn fp-btn-ghost fp-btn-sm"}
                    onClick={() => void fetch(`/api/admin/gyms/${gym.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscriptionStatus: status }) }).then(load)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </AppShell>
  );
}
