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

/**
 * How long to wait for requestVideoFrameCallback before the animation clock
 * feeds the gate. iOS defines the method for a camera stream and then may
 * never invoke it. A stuck presented-frame count is a separate drop.
 */
export const VIDEO_FRAME_FALLBACK_MS = 400;

export interface PhoneVideoMetadata {
  /** Seconds. A later value must not be stored as the frame's milliseconds. */
  mediaTime?: number;
  /** Milliseconds on the performance clock, once the browser has converted it. */
  presentationTime?: number;
  expectedDisplayTime?: number;
  presentedFrames?: number;
}

const ARRIVAL_SLACK_MS = 2_000;
const UNIT_RATIO = 20;

/** True when `stamp` is already on the same millisecond clock as `arrivedAt`. */
export function onArrivalClock(stamp: number, arrivedAt: number) {
  if (!Number.isFinite(stamp) || !Number.isFinite(arrivedAt) || stamp <= 0) return false;
  const delta = Math.abs(arrivedAt - stamp);
  const small = Math.min(Math.abs(arrivedAt), stamp);
  const large = Math.max(Math.abs(arrivedAt), stamp);
  if (small > 0 && large / small > UNIT_RATIO) return false;
  return delta <= ARRIVAL_SLACK_MS;
}

/**
 * One millisecond timestamp for the frame gate.
 * `mediaTime` is seconds. A callback `now` of 0, of those seconds, or of
 * microseconds is not used. The arrival clock is the fallback so a unit
 * change cannot become `newest` and reject every later frame.
 */
export function framePresentationMs(callbackNow: number, metadata: PhoneVideoMetadata, arrivedAt: number) {
  if (onArrivalClock(callbackNow, arrivedAt)) return callbackNow;
  if (typeof metadata.presentationTime === "number" && onArrivalClock(metadata.presentationTime, arrivedAt)) {
    return metadata.presentationTime;
  }
  if (typeof metadata.expectedDisplayTime === "number" && onArrivalClock(metadata.expectedDisplayTime, arrivedAt)) {
    return metadata.expectedDisplayTime;
  }
  return Number.isFinite(arrivedAt) ? arrivedAt : callbackNow;
}

export interface VideoFrameCursor {
  presentedFrames: number;
  mediaTime: number;
  frameAt: number;
  /** True after the count changes between two real frames. A stuck 0 never sets this. */
  presentedAdvanced: boolean;
}

export function emptyVideoCursor(): VideoFrameCursor {
  return { presentedFrames: -1, mediaTime: Number.NaN, frameAt: -1, presentedAdvanced: false };
}

/**
 * A camera callback whose `presentedFrames` stays 0 is still a new frame when
 * the millisecond clock moved. Once the count has advanced, a repeat of that
 * count is the same picture and is not sampled again.
 */
export function takeVideoFrame(
  cursor: VideoFrameCursor,
  input: { callbackNow: number; metadata: PhoneVideoMetadata; arrivedAt: number },
): { accept: boolean; frameAt: number; cursor: VideoFrameCursor } {
  const frameAt = framePresentationMs(input.callbackNow, input.metadata, input.arrivedAt);
  const presented = input.metadata.presentedFrames;
  const media = input.metadata.mediaTime;
  const first = cursor.frameAt < 0;
  const presentedMoved = typeof presented === "number" && cursor.presentedFrames >= 0 && presented !== cursor.presentedFrames;
  const counterWorks = cursor.presentedAdvanced || presentedMoved;
  const mediaMoved = typeof media === "number" && Number.isFinite(media) && media !== cursor.mediaTime;
  const clockMoved = frameAt > cursor.frameAt;
  const samePicture = !first && (counterWorks ? !presentedMoved : !clockMoved && !mediaMoved);
  if (samePicture) return { accept: false, frameAt, cursor };
  return {
    accept: true,
    frameAt,
    cursor: {
      presentedFrames: typeof presented === "number" ? presented : cursor.presentedFrames,
      mediaTime: typeof media === "number" && Number.isFinite(media) ? media : cursor.mediaTime,
      frameAt,
      presentedAdvanced: counterWorks,
    },
  };
}

/**
 * A video callback that was not run or queued is not a fresh camera frame.
 * Stamping it as fresh keeps the animation clock off while every late frame is
 * ignored, so a long hitch never classifies and jump, squat, and leans stop.
 */
export function videoFrameKeepsClock(action: "run" | "queue" | "ignore") {
  return action === "run" || action === "queue";
}

/** Minimum gap between animation-clock samples. Stops a 60Hz loop from stacking inference. */
export const ANIMATION_SAMPLE_GAP_MS = 12;

/**
 * The caller already chose the animation clock because video frames are missing or quiet.
 * A camera whose currentTime stays put still classifies. iOS can present a new picture
 * without moving currentTime, and that picture is what reaches jump, squat, and lean.
 */
export function takeAnimationSample(input: { now: number; lastSampleAt: number }) {
  if (!Number.isFinite(input.now) || !Number.isFinite(input.lastSampleAt)) return false;
  return input.now - input.lastSampleAt >= ANIMATION_SAMPLE_GAP_MS;
}

/**
 * Samsung Internet presents no new pictures when the video is opacity 0,
 * visibility hidden, display none, or fully covered. A few painted pixels still
 * present, so a non-zero box at opacity 0.02 or more is a live camera.
 * A hidden or zero-size video is not. `presentedFrames` staying 0 is not an
 * absent frame: takeVideoFrame still accepts a painted video.
 */
export function cameraBoxKeepsFrames(box: { width: number; height: number; opacity?: number; hidden?: boolean }) {
  if (box.hidden) return false;
  if (typeof box.opacity === "number" && !(box.opacity >= 0.02)) return false;
  return box.width > 0 && box.height > 0;
}

/** The animation clock samples only while the video-frame callback is absent, quiet, or not actually painted. */
export function paintedCameraSampleSource(input: {
  boxKeepsFrames: boolean;
  hasVideoFrameCallback: boolean;
  videoFrames: number;
  elapsedMs: number;
  sinceVideoFrameMs: number;
}): "video-frame" | "animation" {
  return cameraSampleSource({
    hasVideoFrameCallback: input.boxKeepsFrames && input.hasVideoFrameCallback,
    videoFrames: input.videoFrames,
    elapsedMs: input.elapsedMs,
    sinceVideoFrameMs: input.sinceVideoFrameMs,
  });
}

/** The animation clock samples only while the video-frame callback is absent or quiet. */
export function cameraSampleSource(input: {
  hasVideoFrameCallback: boolean;
  videoFrames: number;
  elapsedMs: number;
  sinceVideoFrameMs: number;
}): "video-frame" | "animation" {
  if (!input.hasVideoFrameCallback) return "animation";
  if (input.videoFrames <= 0) {
    return input.elapsedMs >= VIDEO_FRAME_FALLBACK_MS ? "animation" : "video-frame";
  }
  if (input.sinceVideoFrameMs >= VIDEO_FRAME_FALLBACK_MS) return "animation";
  return "video-frame";
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
