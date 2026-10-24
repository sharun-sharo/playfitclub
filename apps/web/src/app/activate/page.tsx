"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppShell } from "@/components/app-shell";

function ActivateForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: params.get("token"), newPassword: form.get("newPassword") }),
    });
    const body = (await response.json()) as { message?: string };
    setPending(false);
    if (!response.ok) {
      setError(body.message ?? "This link could not be used.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main id="content" className="fp-wrap fp-page">
      <p className="fp-kicker">Account</p>
      <h1>Choose your password</h1>
      <p className="fp-lead">This one-time link sets a password. It does not show or store the previous one.</p>
      <form className="fp-form fp-form-narrow" onSubmit={(event) => void onSubmit(event)}>
        <div className="fp-field">
          <label htmlFor="newPassword">New password</label>
          <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        {error ? <p className="fp-error">{error}</p> : null}
        <div className="fp-actions">
          <button className="fp-btn fp-btn-primary" type="submit" disabled={pending}>{pending ? "Saving" : "Activate password"}</button>
        </div>
      </form>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="fp-wrap fp-page fp-muted">Loading…</p>}>
        <ActivateForm />
      </Suspense>
    </AppShell>
  );
}
