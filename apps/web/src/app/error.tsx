"use client";

import { AppShell } from "@/components/app-shell";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page">
        <p className="fp-kicker">PlayFit Club</p>
        <h1>Something broke</h1>
        <p className="fp-lead">The screen hit an unexpected error. Your camera was not recorded.</p>
        <div className="fp-actions">
          <button className="fp-btn fp-btn-primary" type="button" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </main>
    </AppShell>
  );
}
