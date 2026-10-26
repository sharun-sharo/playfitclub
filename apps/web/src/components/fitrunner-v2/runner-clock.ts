import { releaseCommand, type BufferStep, type HeldCommand } from "@fitplay/game";

/** One integration slice. The laptop loop already clamped each frame to this. */
export const RUNNER_SLICE_S = 0.05;

/**
 * Television catch-up limit for one displayed frame.
 * A stalled tab must not spend the whole gap and teleport the runner.
 */
export const TV_CATCHUP_CAP_S = 0.25;

/** Slower than this, the frame blocked the main thread long enough to age a command. */
export const LONG_FRAME_MS = 50;

export type RunSpeed = {
  forwardSpeed: number;
  speedGain: number;
  maxSpeed: number;
};

/**
 * Laptop: one step, clamped at 50ms, which is the loop that already shipped.
 * Television: the real gap is spent as 50ms slices, up to 250ms.
 * At 60fps both return one ~16.7ms step, so the distance matches.
 */
export function runnerFrameSlices(rawDeltaSeconds: number, television: boolean): number[] {
  const delta = Number.isFinite(rawDeltaSeconds) && rawDeltaSeconds > 0 ? rawDeltaSeconds : 0;
  if (delta === 0) return [];
  if (!television) return [Math.min(RUNNER_SLICE_S, delta)];
  let remaining = Math.min(TV_CATCHUP_CAP_S, delta);
  const slices: number[] = [];
  while (remaining > 1e-6) {
    const step = Math.min(RUNNER_SLICE_S, remaining);
    slices.push(step);
    remaining -= step;
  }
  return slices;
}

/** Pace after `elapsedSeconds` has already been advanced by this slice. */
export function runPace(elapsedSeconds: number, speed: RunSpeed, speedMul: number) {
  return Math.min(speed.maxSpeed, speed.forwardSpeed + elapsedSeconds * speed.speedGain) * speedMul;
}

export function runStepMeters(elapsedSeconds: number, dt: number, speed: RunSpeed, speedMul: number) {
  return runPace(elapsedSeconds, speed, speedMul) * dt;
}

/**
 * Forward meters for a clean run. `frameDeltas` are real seconds between displayed frames.
 * Television spends each gap. The laptop keeps the single clamped step.
 */
export function forwardTravel(frameDeltas: number[], television: boolean, speed: RunSpeed, speedMul = 1) {
  let elapsed = 0;
  let distance = 0;
  for (const raw of frameDeltas) {
    for (const dt of runnerFrameSlices(raw, television)) {
      elapsed += dt;
      distance += runStepMeters(elapsed, dt, speed, speedMul);
    }
  }
  return distance;
}

/** Add this frame's wall time when it was slow. Short frames leave the debt unchanged. */
export function noteLongFrame(debtMs: number, frameGapMs: number) {
  const debt = Number.isFinite(debtMs) && debtMs > 0 ? debtMs : 0;
  if (!(frameGapMs >= LONG_FRAME_MS)) return debt;
  return debt + frameGapMs;
}

/**
 * Laptop uses the shared 800ms window unchanged.
 * Television judges age from the TV receive clock. Time spent inside a long frame
 * does not age the latest held jump, squat, or lane, so a blocked draw does not
 * drop it while the runner can still perform it. The caller applies that value
 * once and clears it. A reconnect has no held command to replay.
 */
export function releaseLiveCommand<T>(
  current: HeldCommand<T> | null,
  now: number,
  staleMs: number,
  ready: boolean,
  television: boolean,
  longFrameDebtMs: number,
): BufferStep<T> {
  if (!television) return releaseCommand(current, now, staleMs, ready);
  const debt = Number.isFinite(longFrameDebtMs) && longFrameDebtMs > 0 ? longFrameDebtMs : 0;
  return releaseCommand(current, now - debt, staleMs, ready);
}
