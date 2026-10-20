"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

export function CopyrightYear() {
  const year = useSyncExternalStore(
    subscribe,
    () => new Date().getFullYear(),
    () => null,
  );
  return <span className="fp-year">{year ?? "\u00a0"}</span>;
}
