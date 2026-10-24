/** A pose command waits at most this long for the current slide or clip to finish. */
export const COMMAND_STALE_MS = 400;

export interface HeldCommand<T> {
  value: T;
  receivedAt: number;
}

export interface BufferStep<T> {
  held: HeldCommand<T> | null;
  apply: T | null;
  dropped: "stale" | null;
}

/** One-deep: a newer command replaces the one still waiting. */
export function holdCommand<T>(current: HeldCommand<T> | null, value: T, receivedAt: number): HeldCommand<T> {
  void current;
  return { value, receivedAt };
}

export function releaseCommand<T>(current: HeldCommand<T> | null, now: number, staleMs: number, ready: boolean): BufferStep<T> {
  if (!current) return { held: null, apply: null, dropped: null };
  if (now - current.receivedAt > staleMs) return { held: null, apply: null, dropped: "stale" };
  if (!ready) return { held: current, apply: null, dropped: null };
  return { held: null, apply: current.value, dropped: null };
}
