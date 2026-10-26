"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { trackEvent } from "@/components/analytics/track-event";
import { AppShell } from "@/components/app-shell";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const body = (await response.json()) as { message?: string; role?: string; mustChangePassword?: boolean };
    setPending(false);
    if (!response.ok) {
      setError(body.message ?? "Could not sign in.");
      return;
    }
    trackEvent("login_completed");
    if (body.mustChangePassword) {
      router.push("/account/password");
      router.refresh();
      return;
    }
    const next = params.get("next");
    const admin = body.role === "ADMIN" || body.role === "SUPER_ADMIN";
    router.push(next || (admin ? "/admin" : "/dashboard"));
    router.refresh();
  }

  async function demo(email: string) {
    setError("");
    const response = await fetch("/api/auth/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { message?: string };
      setError(body.message ?? "Demo sign-in is unavailable.");
      return;
    }
    trackEvent("login_completed");
    const body = (await response.json()) as { mustChangePassword?: boolean };
    if (body.mustChangePassword) {
      router.push("/account/password");
      router.refresh();
      return;
    }
    router.push(email.startsWith("admin") ? "/admin" : "/dashboard");
    router.refresh();
  }

  return (
    <main id="content" className="fp-wrap fp-page">
      <p className="fp-kicker">Account</p>
      <h1>Sign in</h1>
      <p className="fp-lead">The free demo runs on your phone and does not need an account. Sign in to keep personal bests.</p>
      <p>
        <Link className="fp-text-link" href="/play/phone">
          Play Demo
        </Link>
      </p>
      <form className="fp-form fp-form-narrow" onSubmit={(event) => void onSubmit(event)}>
        <div className="fp-form-grid">
          <div className="fp-field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="fp-field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" minLength={8} required />
          </div>
          {error ? <p className="fp-error">{error}</p> : null}
        </div>
        <div className="fp-actions">
          <button className="fp-btn fp-btn-primary" type="submit" disabled={pending}>{pending ? "Signing in" : "Sign in"}</button>
        </div>
      </form>
      <p className="fp-status">Accounts are created by the PlayFit Club team after subscription confirmation. Password resets are issued by the team.</p>
      {process.env.NODE_ENV !== "production" ? (
        <section className="fp-card fp-demo fp-form-narrow">
          <p className="fp-kicker">Development accounts</p>
          <div className="fp-inline-actions">
            <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => void demo("player@fitplay.dev")}>Demo player</button>
            <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => void demo("owner@fitplay.dev")}>Demo gym owner</button>
            <button type="button" className="fp-btn fp-btn-ghost fp-btn-sm" onClick={() => void demo("admin@fitplay.dev")}>Demo admin</button>
          </div>
        </section>
      ) : null}
    </main>
  );
}

export default function LoginPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="fp-wrap fp-page fp-muted">Loading sign in…</p>}>
        <LoginForm />
      </Suspense>
    </AppShell>
  );
}
