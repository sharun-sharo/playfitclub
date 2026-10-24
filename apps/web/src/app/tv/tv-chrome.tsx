import Link from "next/link";
import type { ReactNode } from "react";

export function TvStatus({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="tv-status" role="status">
      <div>
        <p className="tv-kicker">PlayFit</p>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
    </main>
  );
}

export function TvPlayFrame({ children }: { children: ReactNode }) {
  return (
    <div data-tv-play="">
      {children}
      <Link className="tv-back" data-tv-aux="" href="/tv">
        TV home
      </Link>
    </div>
  );
}
