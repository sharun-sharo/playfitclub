"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";

export default function PasswordPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }),
    });
    const body = (await response.json()) as { message?: string };
    setPending(false);
    if (!response.ok) {
      setError(body.message ?? "Could not change the password.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page">
        <p className="fp-kicker">Account</p>
        <h1>Set a new password</h1>
        <p className="fp-lead">The first sign-in must replace the temporary password. The current password is not shown here.</p>
        <form className="fp-form fp-form-narrow" onSubmit={(event) => void onSubmit(event)}>
          <div className="fp-form-grid">
            <div className="fp-field">
              <label htmlFor="currentPassword">Current password</label>
              <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" minLength={8} required />
            </div>
            <div className="fp-field">
              <label htmlFor="newPassword">New password</label>
              <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            {error ? <p className="fp-error">{error}</p> : null}
          </div>
          <div className="fp-actions">
            <button className="fp-btn fp-btn-primary" type="submit" disabled={pending}>{pending ? "Saving" : "Save password"}</button>
          </div>
        </form>
      </main>
    </AppShell>
  );
}
