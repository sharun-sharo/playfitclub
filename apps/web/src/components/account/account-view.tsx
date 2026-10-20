"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";

type Panel = "home" | "sessions" | "leaderboard" | "settings";

export function AccountView({ panel }: { panel: Panel }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [gym, setGym] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const router = useRouter();

  useEffect(() => {
    void fetch("/api/dashboard").then(async (response) => {
      if (response.status === 401) {
        router.push("/login?next=/dashboard");
        return;
      }
      setData(await response.json());
    });
    void fetch("/api/gym").then(async (response) => setGym(await response.json()));
  }, [router]);

  const results = (data?.results as Array<Record<string, unknown>> | undefined) ?? [];
  const sessions = (data?.sessions as Array<Record<string, unknown>> | undefined) ?? [];
  const achievements = (data?.achievements as Array<Record<string, unknown>> | undefined) ?? [];
  const gymBody = gym?.gym as { id: string; name: string; slug: string; subscriptionStatus: string; branding: { tagline: string; accent: string; logoText: string } | null; ownerId: string; staff: Array<{ email: string; displayName: string; role: string }> } | null;
  const board = (gym?.leaderboard as Array<Record<string, unknown>> | undefined) ?? [];

  function note(ok: boolean, text: string) {
    setMessageOk(ok);
    setMessage(text);
  }

  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page">
        <div className="fp-account">
          <nav className="fp-side" aria-label="Account">
            <AccountLink href="/dashboard" active={panel === "home"}>Overview</AccountLink>
            <AccountLink href="/dashboard/sessions" active={panel === "sessions"}>Sessions</AccountLink>
            <AccountLink href="/dashboard/leaderboard" active={panel === "leaderboard"}>Leaderboard</AccountLink>
            <AccountLink href="/dashboard/settings" active={panel === "settings"}>Settings</AccountLink>
          </nav>
          <section>
            {panel === "home" ? (
              <>
                <p className="fp-kicker">Account</p>
                <h1>Your floor</h1>
                <p className="fp-score">{Number(data?.bestScore ?? 0)}</p>
                <p className="fp-status">Best saved score</p>
                <div className="fp-chips">
                  {achievements.length === 0 ? <p className="fp-muted">Finish a signed-in round to unlock achievements.</p> : null}
                  {achievements.map((item) => <span key={String(item.key)} className="fp-chip">{String(item.title)}</span>)}
                </div>
                <ResultList results={results.slice(0, 5)} />
              </>
            ) : null}
            {panel === "sessions" ? (
              <>
                <p className="fp-kicker">Account</p>
                <h1>Sessions</h1>
                <ul className="fp-stack">
                  {sessions.length === 0 ? <li className="fp-muted">No sessions yet. Open a TV lobby and play.</li> : null}
                  {sessions.map((session) => (
                    <li key={String(session.id)} className="fp-list-card">
                      <h2>{String(session.gameName)} · {String(session.status)}</h2>
                      <p className="fp-status">{String(session.joinCode)} · {session.gymName ? String(session.gymName) : "Home"}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {panel === "leaderboard" ? (
              <>
                <p className="fp-kicker">Account</p>
                <h1 className="fp-title-wide">{gymBody ? `${gymBody.name} board` : "Play to appear here"}</h1>
                <LeaderList entries={board} />
              </>
            ) : null}
            {panel === "settings" ? (
              <>
                <p className="fp-kicker">Account</p>
                <h1>Settings</h1>
                <div className="fp-actions">
                  <button className="fp-btn fp-btn-ghost" type="button" onClick={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/"))}>Sign out</button>
                </div>
                {gymBody ? (
                  <form
                    className="fp-form fp-form-narrow"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      void fetch("/api/gym", {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          name: form.get("name"),
                          tagline: form.get("tagline"),
                          accent: form.get("accent"),
                          logoText: form.get("logoText"),
                        }),
                      }).then(async (response) => {
                        const body = (await response.json()) as { message?: string };
                        note(response.ok, response.ok ? "Gym branding saved." : body.message ?? "Could not save.");
                      });
                    }}
                  >
                    <p className="fp-muted">Subscription {gymBody.subscriptionStatus}. Expired gyms keep their history and cannot open new gym sessions.</p>
                    <div className="fp-form-grid">
                      <div className="fp-field"><label htmlFor="name">Gym name</label><input id="name" name="name" defaultValue={gymBody.name} /></div>
                      <div className="fp-field"><label htmlFor="tagline">Tagline</label><input id="tagline" name="tagline" defaultValue={gymBody.branding?.tagline ?? ""} /></div>
                      <div className="fp-field"><label htmlFor="accent">Accent</label><input id="accent" name="accent" defaultValue={gymBody.branding?.accent ?? "#3df0ff"} /></div>
                      <div className="fp-field"><label htmlFor="logoText">Logo text</label><input id="logoText" name="logoText" defaultValue={gymBody.branding?.logoText ?? "FP"} maxLength={4} /></div>
                    </div>
                    <div className="fp-actions">
                      <button className="fp-btn fp-btn-primary" type="submit">Save branding</button>
                    </div>
                    <div className="fp-field fp-field-wide">
                      <label htmlFor="staffEmail">Add staff by email</label>
                      <input id="staffEmail" name="staffEmail" type="email" />
                      <div className="fp-inline-actions">
                        <button
                          type="button"
                          className="fp-btn fp-btn-ghost fp-btn-sm"
                          onClick={() => {
                            const email = (document.getElementById("staffEmail") as HTMLInputElement | null)?.value;
                            void fetch("/api/gym/staff", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role: "STAFF" }) })
                              .then(async (response) => {
                                const body = (await response.json()) as { message?: string };
                                note(response.ok, response.ok ? "Staff access updated." : body.message ?? "Could not add staff.");
                              });
                          }}
                        >Add</button>
                      </div>
                    </div>
                    <ul className="fp-stack">
                      {gymBody.staff.map((member) => <li key={member.email}>{member.displayName} · {member.role}</li>)}
                    </ul>
                    {message ? <p className={messageOk ? "fp-success" : "fp-error"}>{message}</p> : null}
                  </form>
                ) : <p className="fp-status">This account is not attached to a gym. Home play is still open.</p>}
              </>
            ) : null}
          </section>
        </div>
      </main>
    </AppShell>
  );
}

function AccountLink({ href, active, children }: { href: string; active: boolean; children: string }) {
  return <Link aria-current={active ? "page" : undefined} href={href}>{children}</Link>;
}

function ResultList({ results }: { results: Array<Record<string, unknown>> }) {
  if (results.length === 0) return <p className="fp-status">No saved results yet.</p>;
  return (
    <ul className="fp-stack">
      {results.map((result) => (
        <li key={String(result.id)} className="fp-list-row">
          <span>{String(result.gameName)} · {String(result.score)}</span>
          <Link className="fp-text-link" href={`/results/${String(result.shareSlug)}`}>Share</Link>
        </li>
      ))}
    </ul>
  );
}

function LeaderList({ entries }: { entries: Array<Record<string, unknown>> }) {
  if (entries.length === 0) return <p className="fp-status">No gym scores yet.</p>;
  return (
    <ol className="fp-stack">
      {entries.map((entry, index) => (
        <li key={`${String(entry.shareSlug)}-${index}`} className="fp-list-row">
          <span>{index + 1}. {String(entry.displayName)}</span>
          <span className="fp-display">{String(entry.score)}</span>
        </li>
      ))}
    </ol>
  );
}
