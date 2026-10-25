/**
 * How long the TV keeps one jump or squat that arrived while the runner
 * cannot take it yet. The clock starts when the TV receives the command
 * (`Date.now` on the TV), not on the phone.
 *
 * The old bound was 400ms. The jump arc is 622ms (takeoff 5.6 m/s, gravity
 * 18), and a side-step is 300ms. The phone marks a hop as landed on the next
 * camera sample unless the hips are clearly off the ground, then waits 180ms.
 * It can send the next squat or jump while the TV is still in that 622ms arc.
 * At 400ms the TV deleted the command about 222ms before landing and the phone
 * does not send the same event id again, so the move never played. That is the
 * production miss: the Railway hop is extra delay, and local keyboard play
 * never enters this wait.
 *
 * 800ms covers the full arc plus the landing frame. A command older than
 * 800ms is still dropped. A reconnect must not replay it.
 */
export const COMMAND_STALE_MS = 800;

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
