/**
 * One camera frame in inference at a time.
 * A newer frame that arrives while MediaPipe is busy replaces any older queued frame.
 * A frame that is already behind the newest one, or older than the stale bound, is not run.
 * Times are milliseconds on one clock. This does not measure a phone-to-TV delay.
 */
export interface CameraFrameGate {
  busy: boolean;
  /** Presentation time of the frame inside detectForVideo, if any. */
  running: number | null;
  /** Highest presentation time accepted or queued. An older arrival is ignored. */
  newest: number | null;
  /** The one frame to run when inference finishes. Older queued frames are dropped. */
  queued: number | null;
}

export type FrameDecision =
  | { action: "run"; at: number; gate: CameraFrameGate }
  | { action: "queue"; gate: CameraFrameGate; dropped: number | null }
  | { action: "ignore"; gate: CameraFrameGate; reason: "stale" | "older" | "idle" };

export function emptyCameraGate(): CameraFrameGate {
  return { busy: false, running: null, newest: null, queued: null };
}

export function offerCameraFrame(gate: CameraFrameGate, frameAt: number, now: number, staleMs: number): FrameDecision {
  if (!Number.isFinite(frameAt) || !Number.isFinite(now) || now - frameAt > staleMs) {
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
      gate: { ...gate, queued: frameAt, newest: frameAt },
    };
  }
  return {
    action: "run",
    at: frameAt,
    gate: { busy: true, running: frameAt, queued: null, newest: frameAt },
  };
}

/** Ends the in-flight frame. Starts the queued frame only when it is still the latest and still fresh. */
export function finishCameraFrame(gate: CameraFrameGate, now: number, staleMs: number): FrameDecision {
  const queued = gate.queued;
  const idle: CameraFrameGate = { busy: false, running: null, queued: null, newest: gate.newest };
  if (queued === null) return { action: "ignore", reason: "idle", gate: idle };
  return offerCameraFrame(idle, queued, now, staleMs);
}
