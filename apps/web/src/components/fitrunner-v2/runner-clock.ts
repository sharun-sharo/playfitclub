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
 * The phone shares this flag with television for the clock only.
 * A MediaPipe hitch on the phone must be spent, or the run freezes.
 * The phone drawing buffer stays on its own preset path.
 */
export function runnerUsesCatchUp(input: { television: boolean; phone: boolean }) {
  return input.television || input.phone;
}

/**
 * Laptop: one step, clamped at 50ms, which is the loop that already shipped.
 * Television and the phone: the real gap is spent as 50ms slices, up to 250ms.
 * At 60fps both return one ~16.7ms step, so the distance matches.
 * A stall longer than 250ms is still cut, so one hitch cannot teleport the runner.
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
 * A hurdle can shove most of a step back and leave a slow slide.
 * Observed creep is about 1.2–1.5 m/s while the pace label stays near 8 m/s.
 * Progress below half the attempted step is that slide, not travel.
 */
const CLEAR_STEP_SHARE = 0.5;

/**
 * Meters this frame may add to distance and score.
 * Forward is a decrease in Z. A clear step adds the attempted meters.
 * Stuck, shoved backward, or only a slow slide through a block adds nothing.
 * Never credits more than the body actually advanced.
 */
export function creditedForwardMeters(attemptedMeters: number, zBefore: number, zAfter: number) {
  const attempted = Number.isFinite(attemptedMeters) ? Math.max(0, attemptedMeters) : 0;
  if (!(attempted > 0) || !(Number.isFinite(zBefore) && Number.isFinite(zAfter))) return 0;
  const forward = zBefore - zAfter;
  if (!(forward > 0)) return 0;
  if (forward < attempted * CLEAR_STEP_SHARE) return 0;
  return Math.min(attempted, forward);
}

/**
 * A hurdle can miss the hit test for a frame, credit a full step, then shove
 * the body back. That step stays pending until another clear frame follows.
 * A block or a slow slide drops it, so the 1.2–1.5 m/s creep does not accumulate.
 * Pause leaves the score where it is.
 */
export type ForwardCredit = {
  committed: number;
  pending: number;
};

export function settleForwardCredit(
  state: ForwardCredit,
  frame: {
    attemptedMeters: number;
    zBefore: number;
    zAfter: number;
    blocked: boolean;
    paused?: boolean;
  },
): ForwardCredit {
  if (frame.paused) return state;
  const kept = frame.blocked ? 0 : creditedForwardMeters(frame.attemptedMeters, frame.zBefore, frame.zAfter);
  if (!(kept > 0)) return { committed: state.committed, pending: 0 };
  return { committed: state.committed + state.pending, pending: kept };
}

export function forwardCreditMeters(state: ForwardCredit) {
  return state.committed + state.pending;
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

export type PhoneFrameDiag = {
  frameMs: number | null;
  longFrame: boolean;
};

/** Gap since the previous displayed frame. The first sample has no gap yet. */
export function notePhoneFrameGap(previousMs: number, nowMs: number): PhoneFrameDiag {
  if (!(previousMs > 0) || !Number.isFinite(previousMs) || !Number.isFinite(nowMs)) {
    return { frameMs: null, longFrame: false };
  }
  const frameMs = nowMs - previousMs;
  if (!(frameMs >= 0)) return { frameMs: null, longFrame: false };
  return { frameMs, longFrame: frameMs >= LONG_FRAME_MS };
}

/** Lines for the existing ?motiondiag=1 corner. No identity, token, or session text. */
export function phoneFrameDiagLines(input: PhoneFrameDiag) {
  const frame = input.frameMs === null || !Number.isFinite(input.frameMs) ? "—" : `${input.frameMs.toFixed(1)} ms`;
  return [`frame ${frame}`, input.longFrame ? "long frame yes" : "long frame no"];
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
