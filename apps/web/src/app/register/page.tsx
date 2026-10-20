"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
        displayName: form.get("displayName"),
      }),
    });
    const body = (await response.json()) as { message?: string };
    if (!response.ok) {
      setError(body.message ?? "Could not create the account.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page">
        <p className="fp-kicker">Account</p>
        <h1>Create a player</h1>
        <form className="fp-form fp-form-narrow" onSubmit={(event) => void onSubmit(event)}>
          <div className="fp-form-grid">
            <div className="fp-field">
              <label htmlFor="displayName">Display name</label>
              <input id="displayName" name="displayName" required minLength={2} maxLength={18} />
            </div>
            <div className="fp-field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div className="fp-field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" minLength={8} required />
            </div>
            {error ? <p className="fp-error">{error}</p> : null}
          </div>
          <div className="fp-actions">
            <button className="fp-btn fp-btn-primary" type="submit">Create account</button>
          </div>
        </form>
      </main>
    </AppShell>
  );
}
