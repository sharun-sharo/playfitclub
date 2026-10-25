export type TvDiagnosticSnapshot = {
  realtime: "unknown" | "connecting" | "connected" | "error";
  session: "unknown" | "creating" | "ready" | "error";
  lastError: string;
};

const listeners = new Set<() => void>();

let snapshot: TvDiagnosticSnapshot = {
  realtime: "unknown",
  session: "unknown",
  lastError: "",
};

export function readTvDiagnostic() {
  return snapshot;
}

export function noteTvDiagnostic(partial: Partial<TvDiagnosticSnapshot>) {
  snapshot = { ...snapshot, ...partial };
  for (const listener of listeners) listener();
}

export function subscribeTvDiagnostic(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
