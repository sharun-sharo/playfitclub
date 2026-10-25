/**
 * One camera frame in inference at a time.
 * A newer frame that arrives while MediaPipe is busy replaces any older queued frame.
 * A frame that is already behind the newest presentation time is not run.
 *
 * `frameAt` is the video presentation timestamp. `now` is performance.now() when the
 * callback ran. Those are not the same clock: a media time, a stuck 0, or a
 * microsecond stamp must not be subtracted from performance.now(). Age uses the
 * offset learned from the first frame. A frame that has waited longer than the
 * stale bound on that clock is not run. This does not measure a phone-to-TV delay.
 */
export interface CameraFrameGate {
  busy: boolean;
  /** Presentation time of the frame inside detectForVideo, if any. */
  running: number | null;
  /** Highest presentation time accepted or queued. An older arrival is ignored. */
  newest: number | null;
  /** The one frame to run when inference finishes. Older queued frames are dropped. */
  queued: number | null;
  /**
   * performance.now() minus presentation time, from the first accepted frame.
   * Null until a frame is accepted. Later age is `now - (frameAt + clockOffset)`.
   */
  clockOffset: number | null;
}

export type FrameDecision =
  | { action: "run"; at: number; gate: CameraFrameGate }
  | { action: "queue"; gate: CameraFrameGate; dropped: number | null }
  | { action: "ignore"; gate: CameraFrameGate; reason: "stale" | "older" | "idle" };

export function emptyCameraGate(): CameraFrameGate {
  return { busy: false, running: null, newest: null, queued: null, clockOffset: null };
}

/**
 * Milliseconds for detectForVideo and pushPose.
 * A presentation clock that steps forward by at most `staleMs` is used as-is.
 * A stuck 0, a microsecond stamp, or a gap larger than the stale bound uses the
 * arrival clock so velocity still sees the real callback spacing.
 */
export function classificationTimestamp(frameAt: number, arrivedAt: number, lastAt: number, staleMs: number) {
  const last = Number.isFinite(lastAt) ? lastAt : 0;
  const floor = last + 1;
  const videoDelta = Number.isFinite(frameAt) ? frameAt - last : Number.POSITIVE_INFINITY;
  const saneVideo = Number.isFinite(frameAt) && frameAt > 0 && videoDelta >= 0 && videoDelta <= staleMs;
  if (saneVideo) return Math.max(frameAt, floor);
  const arrived = Number.isFinite(arrivedAt) ? arrivedAt : floor;
  return Math.max(arrived, floor);
}

export function offerCameraFrame(gate: CameraFrameGate, frameAt: number, now: number, staleMs: number): FrameDecision {
  if (!Number.isFinite(frameAt) || !Number.isFinite(now)) {
    return { action: "ignore", reason: "stale", gate };
  }
  // The first frame defines how far the presentation clock sits from performance.now().
  // Age is measured with that offset. Subtracting the raw clocks marks every media
  // timestamp stale once the page has been open for more than staleMs.
  const clockOffset = gate.clockOffset ?? now - frameAt;
  if (gate.clockOffset !== null && now - (frameAt + gate.clockOffset) > staleMs) {
    return { action: "ignore", reason: "stale", gate };
  }
  if (gate.newest !== null && frameAt < gate.newest) {
    return { action: "ignore", reason: "older", gate };
  }
  if (gate.busy) {
    const dropped = gate.queued !== null && gate.queued !== frameAt ? gate.queued : null;
    return {
      action: "queue",
      dropped,
      gate: { ...gate, queued: frameAt, newest: frameAt, clockOffset },
    };
  }
  return {
    action: "run",
    at: frameAt,
    gate: { busy: true, running: frameAt, queued: null, newest: frameAt, clockOffset },
  };
}

/** Ends the in-flight frame. Starts the queued frame only when it is still the latest and still fresh. */
export function finishCameraFrame(gate: CameraFrameGate, now: number, staleMs: number): FrameDecision {
  const queued = gate.queued;
  const idle: CameraFrameGate = {
    busy: false,
    running: null,
    queued: null,
    newest: gate.newest,
    clockOffset: gate.clockOffset,
  };
  if (queued === null) return { action: "ignore", reason: "idle", gate: idle };
  return offerCameraFrame(idle, queued, now, staleMs);
}
