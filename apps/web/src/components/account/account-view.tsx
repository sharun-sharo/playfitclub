"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FitnessProfile } from "@/components/account/fitness-profile";
import { AppShell } from "@/components/app-shell";
import { ScoreBoardPanel, type BoardEntry } from "@/components/gym/score-board-panel";

type Panel = "home" | "sessions" | "leaderboard" | "settings";

export function AccountView({ panel }: { panel: Panel }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [gym, setGym] = useState<Record<string, unknown> | null>(null);
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const [standing, setStanding] = useState<{ assigned: boolean; label: string; gym: { name: string; status: string; subscriptionStatus: string } | null; personalXp: number; gymXp: number; bestScore: number; rank: number | null; leaderboard: BoardEntry[]; games: Array<{ slug: string; name: string }> } | null>(null);
  const [standingState, setStandingState] = useState<"loading" | "error" | "ready">("loading");
  const [period, setPeriod] = useState("week");
  const [game, setGame] = useState("overall");
  const router = useRouter();

  function loadStanding(nextPeriod = period, nextGame = game) {
    const params = new URLSearchParams({ period: nextPeriod, game: nextGame });
    void fetch(`/api/me/gym?${params.toString()}`).then(async (response) => {
      if (!response.ok) {
        setStandingState("error");
        return;
      }
      setStanding(await response.json());
      setStandingState("ready");
    }).catch(() => setStandingState("error"));
  }

  useEffect(() => {
    void fetch("/api/dashboard").then(async (response) => {
      if (response.status === 401) {
        router.push("/login?next=/dashboard");
        return;
      }
      setData(await response.json());
    });
    void fetch("/api/gym").then(async (response) => setGym(await response.json()));
    loadStanding("week", "overall");
  }, [router]);

  const results = (data?.results as Array<Record<string, unknown>> | undefined) ?? [];
  const sessions = (data?.sessions as Array<Record<string, unknown>> | undefined) ?? [];
  const achievements = (data?.achievements as Array<Record<string, unknown>> | undefined) ?? [];
  const gymBody = gym?.gym as { id: string; name: string; slug: string; subscriptionStatus: string; branding: { tagline: string; accent: string; logoText: string } | null; ownerId: string; staff: Array<{ email: string; displayName: string; role: string }> } | null;
  const isOwner = gym?.isOwner === true;

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
            {isOwner ? <AccountLink href="/dashboard/gym" active={false}>Gym floor</AccountLink> : null}
          </nav>
          <section>
            {panel === "home" ? (
              <>
                <p className="fp-kicker">Account</p>
                <h1>Your floor</h1>
                <p className="fp-score">{Number(data?.bestScore ?? 0)}</p>
                <p className="fp-status">Best saved score</p>
                {standingState === "loading" ? <p className="fp-status">Loading your gym…</p> : null}
                {standingState === "ready" && standing?.assigned ? <p className="fp-status">{standing.gym?.name ?? standing.label} · {standing.gym?.subscriptionStatus ?? standing.gym?.status ?? "assigned"} · gym rank {standing.rank ?? "—"} · {standing.gymXp} gym XP</p> : null}
                {standingState === "ready" && standing && !standing.assigned ? <p className="fp-status">Individual player. Personal play stays on your own subscription.</p> : null}
                <p className="fp-muted">Personal XP {standing?.personalXp ?? 0}. Gym boards count only workouts saved while a gym seat was active.</p>
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
                <h1 className="fp-title-wide">{standingState === "loading" ? "Your board" : standing?.assigned ? `${standing.label} board` : "Individual player"}</h1>
                {standingState === "loading" ? <p className="fp-status">Loading your gym…</p> : null}
                {standing?.assigned ? (
                  <>
                    <p className="fp-status">Your rank {standing.rank ?? "—"} · best gym score {standing.bestScore}</p>
                    <div className="fp-board-tabs" role="tablist" aria-label="Period">
                      {(["day", "week", "month", "all"] as const).map((item) => (
                        <button key={item} type="button" className={period === item ? "fp-btn fp-btn-primary fp-btn-sm" : "fp-btn fp-btn-ghost fp-btn-sm"} onClick={() => { setPeriod(item); loadStanding(item, game); }}>{item === "all" ? "All time" : item}</button>
                      ))}
                    </div>
                    <div className="fp-field">
                      <label htmlFor="player-game">Game</label>
                      <select id="player-game" value={game} onChange={(event) => { setGame(event.target.value); loadStanding(period, event.target.value); }}>
                        <option value="overall">Overall</option>
                        {standing.games.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                      </select>
                    </div>
                    <ScoreBoardPanel entries={standing.leaderboard} status={standingState} />
                  </>
                ) : (
                  <p className="fp-status">You are not assigned to a gym, so private gym boards stay hidden. Home play still follows your own subscription.</p>
                )}
                {standingState === "error" ? <p className="fp-error">Your gym status could not be loaded.</p> : null}
                {isOwner ? <p className="fp-status"><Link className="fp-text-link" href="/dashboard/gym">Open the gym floor</Link></p> : null}
              </>
            ) : null}
            {panel === "settings" ? (
              <>
                <p className="fp-kicker">Account</p>
                <h1>Settings</h1>
                <FitnessProfile />
                <div className="fp-actions">
                  <button className="fp-btn fp-btn-ghost" type="button" onClick={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/"))}>Sign out</button>
                </div>
                {gymBody ? (
                  <>
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
                  <GymInvites onNote={note} />
                  </>
                ) : <p className="fp-status">This account is not attached to a gym. Home play is still open.</p>}
              </>
            ) : null}
          </section>
        </div>
      </main>
    </AppShell>
  );
}

function GymInvites({ onNote }: { onNote: (ok: boolean, text: string) => void }) {
  const [state, setState] = useState<{ seatLimit: number | null; occupied: number; pendingInvites: number; available: number; invitations: Array<{ id: string; email: string; status: string }> } | null>(null);
  const [delivery, setDelivery] = useState("");

  function load() {
    void fetch("/api/gym/invitations").then(async (response) => {
      if (!response.ok) return;
      setState(await response.json());
    });
  }

  useEffect(() => { load(); }, []);
  if (!state) return null;

  return (
    <form className="fp-form fp-form-narrow" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void fetch("/api/gym/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("inviteEmail") }) })
        .then(async (response) => {
          const body = (await response.json()) as { message?: string; delivery?: { activationPath?: string } };
          if (!response.ok) onNote(false, body.message ?? "Could not invite that member.");
          else {
            setDelivery(body.delivery?.activationPath ?? "");
            onNote(true, "Invitation created. It does not start play by itself.");
            load();
          }
        });
    }}>
      <h2>Member seats</h2>
      <p className="fp-status">{state.occupied} occupied · {state.pendingInvites} pending · {state.available} available{state.seatLimit === null ? " · no seats allocated" : ` · limit ${state.seatLimit}`}</p>
      <div className="fp-field">
        <label htmlFor="inviteEmail">Invite a member by email</label>
        <input id="inviteEmail" name="inviteEmail" type="email" required />
      </div>
      <button className="fp-btn fp-btn-primary" type="submit">Send invite</button>
      {delivery ? <p className="fp-note">Copy this invite link once. It is not shown again. {delivery}</p> : null}
      <ul className="fp-stack">
        {state.invitations.map((invite) => <li key={invite.id}>{invite.email} · {invite.status}</li>)}
      </ul>
    </form>
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

