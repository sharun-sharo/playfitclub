"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppShell } from "@/components/app-shell";

function InviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function accept() {
    setError("");
    const response = await fetch("/api/gym/invitations/accept", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: params.get("token") }),
    });
    const body = (await response.json()) as { message?: string };
    if (response.status === 401) {
      const next = `/invite?token=${encodeURIComponent(params.get("token") ?? "")}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (!response.ok) {
      setError(body.message ?? "The invitation could not be accepted.");
      return;
    }
    setMessage(body.message ?? "You are linked to the gym.");
  }

  return (
    <main id="content" className="fp-wrap fp-page">
      <p className="fp-kicker">Gym</p>
      <h1>Gym invitation</h1>
      <p className="fp-lead">
        Accepting links an existing account to the gym. It does not create an account, and it does not start play unless the gym subscription is active and a seat is free.
      </p>
      {error ? <p className="fp-error">{error}</p> : null}
      {message ? <p className="fp-success">{message}</p> : null}
      <div className="fp-actions">
        <button className="fp-btn fp-btn-primary" type="button" onClick={() => void accept()}>Accept invitation</button>
      </div>
    </main>
  );
}

export default function InvitePage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="fp-wrap fp-page fp-muted">Loading…</p>}>
        <InviteForm />
      </Suspense>
    </AppShell>
  );
}
