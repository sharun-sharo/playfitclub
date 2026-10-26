import { DEFAULT_FRAMING_CONFIG, type FramingCode, type FramingLandmark } from "../../lib/vision/framing";
import { inCameraFrame } from "../../lib/vision/preview-fit";

/**
 * Phone start gate. Visibility floor is the existing framing floor (0.45).
 *
 * Required, each inside the image:
 * - head: nose (0)
 * - shoulders: left (11), right (12)
 * - hips: left (23), right (24)
 * - legs: left knee (25), right knee (26)
 *
 * Ankles (27, 28) are not required. The existing framing GOOD path already
 * accepts covered legs (head, shoulders, and hips) for play. That path does
 * not open this start gate. There is no distance sensor: too close, too far,
 * off center, and missing feet come from the existing framing codes.
 */
export const PHONE_VISIBILITY_FLOOR = DEFAULT_FRAMING_CONFIG.minVisibility;

export const PHONE_START_LANDMARKS = {
  head: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
} as const;

export const PHONE_ANKLES_NOT_REQUIRED = [27, 28] as const;

export const PHONE_STABLE_MS = 2000;
export const PHONE_JITTER_MS = 400;
/** Same sustained-loss window the framing monitor already uses before it pauses. */
export const PHONE_LOSS_GRACE_MS = DEFAULT_FRAMING_CONFIG.pauseMs;
export const PHONE_COUNTDOWN_MS = 1000;
/** Green PLAYER READY stays on screen before 3. */
export const PHONE_READY_HOLD_MS = 700;

export const PHONE_COUNTDOWN_LABELS = ["3", "2", "1", "GO"] as const;
export type PhoneCountdownLabel = (typeof PHONE_COUNTDOWN_LABELS)[number];

export const PHONE_PLAYER_READY = "PLAYER READY";

export const PHONE_STAGE_NOTE = "Turn the phone sideways, and use the browser fullscreen control if you want.";

export const PHONE_STATUSES = ["Finding Player", "Adjust Position", "Calibrating", "Ready"] as const;
export type PhoneStatus = (typeof PHONE_STATUSES)[number];

export const PHONE_GUIDANCE = ["Move Back", "Move Closer", "Move Left", "Move Right", "Stand Straight", "Full Body Detected"] as const;
export type PhoneGuidance = (typeof PHONE_GUIDANCE)[number];

export type PhoneBodySignal = "none" | "partial" | "full";

export type PhoneCalibPhase = "finding" | "adjust" | "calibrating" | "ready" | "countdown" | "running" | "warning" | "reposition";

export interface PhoneCalibConfig {
  stableMs: number;
  jitterMs: number;
  countdownMs: number;
  lossGraceMs: number;
  readyHoldMs: number;
}

export const PHONE_CALIB_CONFIG: PhoneCalibConfig = {
  stableMs: PHONE_STABLE_MS,
  jitterMs: PHONE_JITTER_MS,
  countdownMs: PHONE_COUNTDOWN_MS,
  lossGraceMs: PHONE_LOSS_GRACE_MS,
  readyHoldMs: PHONE_READY_HOLD_MS,
};

export interface PhoneCalibState {
  phase: PhoneCalibPhase;
  status: PhoneStatus | null;
  guidance: PhoneGuidance | null;
  countdown: PhoneCountdownLabel | null;
  coursePaused: boolean;
  startCourse: boolean;
  resumeCourse: boolean;
  runStarted: boolean;
  holdStartedAt: number | null;
  lastFullAt: number | null;
  countdownIndex: number;
  countdownShownAt: number | null;
  readyAt: number | null;
  lostSince: number | null;
  shown: PhoneCountdownLabel[];
}

export interface PhoneCalibSample {
  now: number;
  signal: PhoneBodySignal;
  guidance?: PhoneGuidance | null;
  /** Existing play-profile pause. Already waited about pauseMs. Ignored once repositioning. */
  framingPause?: boolean;
}

export interface PhoneStageCaps {
  fullscreen?: () => Promise<void>;
  orientationLock?: (orientation: "landscape") => Promise<void>;
}

export function createPhoneCalibration(): PhoneCalibState {
  return {
    phase: "finding",
    status: "Finding Player",
    guidance: null,
    countdown: null,
    coursePaused: false,
    startCourse: false,
    resumeCourse: false,
    runStarted: false,
    holdStartedAt: null,
    lastFullAt: null,
    countdownIndex: -1,
    countdownShownAt: null,
    readyAt: null,
    lostSince: null,
    shown: [],
  };
}

function jointSeen(landmarks: Array<FramingLandmark | null | undefined> | null | undefined, index: number, minVisibility: number) {
  const point = landmarks?.[index];
  if (!point || (point.visibility ?? 0) < minVisibility) return false;
  return inCameraFrame(point);
}

/** True when the start-gate joints clear the visibility floor. Ankles are ignored. */
export function phoneFullBody(
  landmarks: Array<FramingLandmark | null | undefined> | null | undefined,
  minVisibility = PHONE_VISIBILITY_FLOOR,
) {
  return Object.values(PHONE_START_LANDMARKS).every((index) => jointSeen(landmarks, index, minVisibility));
}

/** Same shoulder test the pose readout already uses. A missing shoulder is not straight. */
export function phoneShouldersLevel(
  landmarks: Array<FramingLandmark | null | undefined> | null | undefined,
  minVisibility = PHONE_VISIBILITY_FLOOR,
) {
  if (!jointSeen(landmarks, PHONE_START_LANDMARKS.leftShoulder, minVisibility)) return false;
  if (!jointSeen(landmarks, PHONE_START_LANDMARKS.rightShoulder, minVisibility)) return false;
  const left = landmarks?.[PHONE_START_LANDMARKS.leftShoulder];
  const right = landmarks?.[PHONE_START_LANDMARKS.rightShoulder];
  if (!left || !right) return false;
  const width = Math.max(0.04, Math.abs(right.x - left.x));
  return Math.abs(left.y - right.y) / width <= 0.35;
}

function bodyPresent(landmarks: Array<FramingLandmark | null | undefined> | null | undefined, minVisibility: number) {
  if (!landmarks) return false;
  return (
    jointSeen(landmarks, PHONE_START_LANDMARKS.head, minVisibility) ||
    jointSeen(landmarks, PHONE_START_LANDMARKS.leftShoulder, minVisibility) ||
    jointSeen(landmarks, PHONE_START_LANDMARKS.rightShoulder, minVisibility) ||
    jointSeen(landmarks, PHONE_START_LANDMARKS.leftHip, minVisibility) ||
    jointSeen(landmarks, PHONE_START_LANDMARKS.rightHip, minVisibility)
  );
}

/**
 * Maps the existing framing codes onto the phone lines.
 * too_close / too_far are the framer's only distance checks. It does not measure metres.
 * keep_feet is a missing-feet check, so it stays Stand Straight instead of a made-up distance.
 */
export function phoneFramingGuidance(input: {
  framingCode: FramingCode | null;
  fullBody: boolean;
  straight: boolean;
  poseCount: number;
}): PhoneGuidance | null {
  if (input.poseCount !== 1) return null;
  switch (input.framingCode) {
    case "too_close":
      return "Move Back";
    case "too_far":
      return "Move Closer";
    case "move_left":
      return "Move Left";
    case "move_right":
      return "Move Right";
    case "good":
      return input.fullBody && input.straight ? "Full Body Detected" : "Stand Straight";
    case "keep_feet":
    case "tilt_up":
    case "tilt_down":
    case "arm_space":
    case "adjust_camera":
      return "Stand Straight";
    default:
      return null;
  }
}

export function phoneBodyReading(input: {
  poseCount: number;
  landmarks: Array<FramingLandmark | null | undefined> | null;
  framingCode: FramingCode | null;
  minVisibility?: number;
}): { signal: PhoneBodySignal; fullBody: boolean; straight: boolean; guidance: PhoneGuidance | null } {
  const minVisibility = input.minVisibility ?? PHONE_VISIBILITY_FLOOR;
  const fullBody = input.poseCount === 1 && phoneFullBody(input.landmarks, minVisibility);
  const straight = phoneShouldersLevel(input.landmarks, minVisibility);
  const guidance = phoneFramingGuidance({
    framingCode: input.framingCode,
    fullBody,
    straight,
    poseCount: input.poseCount,
  });
  if (input.poseCount <= 0) return { signal: "none", fullBody: false, straight: false, guidance: null };
  if (input.poseCount !== 1) return { signal: "partial", fullBody: false, straight, guidance: null };
  if (fullBody && straight && input.framingCode === "good") return { signal: "full", fullBody, straight, guidance };
  if (!bodyPresent(input.landmarks, minVisibility) && (input.framingCode === null || input.framingCode === "adjust_camera")) {
    return { signal: "none", fullBody, straight, guidance: null };
  }
  return { signal: "partial", fullBody, straight, guidance };
}

function clearEdges(state: PhoneCalibState): PhoneCalibState {
  if (!state.startCourse && !state.resumeCourse) return state;
  return { ...state, startCourse: false, resumeCourse: false };
}

function withinJitter(state: PhoneCalibState, sample: PhoneCalibSample, config: PhoneCalibConfig) {
  if (sample.signal === "none") return false;
  if (sample.signal === "full") return true;
  if (state.lastFullAt === null) return false;
  return sample.now - state.lastFullAt < config.jitterMs;
}

function positioningPhase(runStarted: boolean, kind: "finding" | "adjust" | "calibrating" | "ready" | "countdown"): PhoneCalibPhase {
  if (kind === "countdown") return "countdown";
  if (kind === "ready") return "ready";
  if (!runStarted) return kind;
  if (kind === "calibrating") return "reposition";
  return "reposition";
}

function cancelCountdown(state: PhoneCalibState, sample: PhoneCalibSample): PhoneCalibState {
  const lost = sample.signal === "none";
  return {
    ...state,
    phase: state.runStarted ? "reposition" : lost ? "finding" : "adjust",
    status: lost ? "Finding Player" : "Adjust Position",
    guidance: lost ? null : sample.guidance ?? null,
    countdown: null,
    countdownIndex: -1,
    countdownShownAt: null,
    shown: [],
    holdStartedAt: null,
    lastFullAt: null,
    readyAt: null,
    coursePaused: state.runStarted,
    startCourse: false,
    resumeCourse: false,
  };
}

function beginCountdown(state: PhoneCalibState, sample: PhoneCalibSample): PhoneCalibState {
  return {
    ...state,
    phase: "countdown",
    status: "Ready",
    guidance: null,
    countdown: "3",
    countdownIndex: 0,
    countdownShownAt: sample.now,
    shown: ["3"],
    coursePaused: state.runStarted,
    startCourse: false,
    resumeCourse: false,
  };
}

function stepCountdown(state: PhoneCalibState, sample: PhoneCalibSample, config: PhoneCalibConfig): PhoneCalibState {
  const lost = sample.signal === "none" || (sample.signal === "partial" && !withinJitter(state, sample, config));
  if (lost) return cancelCountdown(state, sample);
  const next = sample.signal === "full" ? { ...state, lastFullAt: sample.now, guidance: null } : { ...state, guidance: null };
  if (next.countdownShownAt === null || sample.now - next.countdownShownAt < config.countdownMs) return next;
  const nextIndex = next.countdownIndex + 1;
  const label = PHONE_COUNTDOWN_LABELS[nextIndex];
  if (!label || label !== "GO") {
    if (!label) return next;
    return {
      ...next,
      countdownIndex: nextIndex,
      countdown: label,
      countdownShownAt: sample.now,
      shown: [...next.shown, label],
    };
  }
  if (next.shown[0] !== "3" || next.shown[1] !== "2" || next.shown[2] !== "1") return next;
  const first = !next.runStarted;
  return {
    ...next,
    phase: "running",
    status: null,
    guidance: null,
    countdown: "GO",
    countdownIndex: 3,
    countdownShownAt: sample.now,
    shown: [...next.shown, "GO"],
    startCourse: first,
    resumeCourse: !first,
    runStarted: true,
    coursePaused: false,
    lostSince: null,
  };
}

function stepPosition(state: PhoneCalibState, sample: PhoneCalibSample, config: PhoneCalibConfig): PhoneCalibState {
  if (state.phase === "countdown" || state.countdownIndex >= 0) return stepCountdown(state, sample, config);
  if (state.phase === "ready" && state.readyAt !== null) {
    const lost = sample.signal === "none" || (sample.signal === "partial" && !withinJitter(state, sample, config));
    if (lost) return cancelCountdown(state, sample);
    if (sample.now >= state.readyAt + config.readyHoldMs) return beginCountdown(state, sample);
    return {
      ...state,
      lastFullAt: sample.signal === "full" ? sample.now : state.lastFullAt,
      startCourse: false,
      resumeCourse: false,
    };
  }

  if (sample.signal === "full" || (sample.signal === "partial" && withinJitter(state, sample, config) && state.holdStartedAt !== null)) {
    const holdStartedAt = state.holdStartedAt ?? sample.now;
    const lastFullAt = sample.signal === "full" ? sample.now : state.lastFullAt;
    const elapsed = sample.now - holdStartedAt;
    if (elapsed >= config.stableMs) {
      return {
        ...state,
        phase: "ready",
        status: "Ready",
        guidance: "Full Body Detected",
        holdStartedAt,
        lastFullAt,
        readyAt: sample.now,
        countdown: null,
        countdownIndex: -1,
        coursePaused: state.runStarted,
        startCourse: false,
        resumeCourse: false,
      };
    }
    return {
      ...state,
      phase: positioningPhase(state.runStarted, "calibrating"),
      status: "Calibrating",
      guidance: sample.signal === "full" ? "Full Body Detected" : sample.guidance ?? state.guidance,
      holdStartedAt,
      lastFullAt,
      readyAt: null,
      countdown: null,
      coursePaused: state.runStarted,
      startCourse: false,
      resumeCourse: false,
    };
  }

  if (sample.signal === "none") {
    return {
      ...state,
      phase: state.runStarted ? "reposition" : "finding",
      status: "Finding Player",
      guidance: null,
      holdStartedAt: null,
      lastFullAt: null,
      readyAt: null,
      countdown: null,
      countdownIndex: -1,
      coursePaused: state.runStarted,
      startCourse: false,
      resumeCourse: false,
    };
  }

  return {
    ...state,
    phase: state.runStarted ? "reposition" : "adjust",
    status: "Adjust Position",
    guidance: sample.guidance ?? null,
    holdStartedAt: null,
    lastFullAt: null,
    readyAt: null,
    countdown: null,
    countdownIndex: -1,
    coursePaused: state.runStarted,
    startCourse: false,
    resumeCourse: false,
  };
}

function stepRun(state: PhoneCalibState, sample: PhoneCalibSample, config: PhoneCalibConfig): PhoneCalibState {
  const lost = sample.signal === "none" || sample.framingPause === true;
  if (!lost) {
    if (state.countdown === "GO" && state.countdownShownAt !== null && sample.now - state.countdownShownAt < config.countdownMs) {
      return { ...state, phase: "running", coursePaused: false, lostSince: null, startCourse: false, resumeCourse: false };
    }
    return {
      ...state,
      phase: "running",
      status: null,
      guidance: null,
      countdown: null,
      coursePaused: false,
      lostSince: null,
      startCourse: false,
      resumeCourse: false,
    };
  }
  const lostSince = state.lostSince ?? sample.now;
  const graceDone = sample.framingPause === true || sample.now - lostSince >= config.lossGraceMs;
  if (!graceDone) {
    return {
      ...state,
      phase: "warning",
      status: null,
      guidance: null,
      countdown: null,
      coursePaused: false,
      lostSince,
      startCourse: false,
      resumeCourse: false,
    };
  }
  return {
    ...state,
    phase: "reposition",
    status: sample.signal === "none" ? "Finding Player" : "Adjust Position",
    guidance: sample.signal === "none" ? null : sample.guidance ?? null,
    countdown: null,
    countdownIndex: -1,
    countdownShownAt: null,
    shown: [],
    holdStartedAt: null,
    lastFullAt: null,
    readyAt: null,
    lostSince,
    coursePaused: true,
    startCourse: false,
    resumeCourse: false,
  };
}

export function stepPhoneCalibration(state: PhoneCalibState, sample: PhoneCalibSample, config: PhoneCalibConfig = PHONE_CALIB_CONFIG): PhoneCalibState {
  const base = clearEdges(state);
  if (base.phase === "running" || base.phase === "warning") return stepRun(base, sample, config);
  return stepPosition(base, sample, config);
}

/** Fullscreen and landscape lock only when the browser offers them. A failure is one honest line. */
export async function requestPhoneStage(caps: PhoneStageCaps): Promise<{ fullscreen: boolean; orientationLocked: boolean; note: string | null }> {
  let fullscreen = false;
  let orientationLocked = false;
  if (typeof caps.fullscreen === "function") {
    try {
      await caps.fullscreen();
      fullscreen = true;
    } catch {
      fullscreen = false;
    }
  }
  if (typeof caps.orientationLock === "function") {
    try {
      await caps.orientationLock("landscape");
      orientationLocked = true;
    } catch {
      orientationLocked = false;
    }
  }
  const note = fullscreen && orientationLocked ? null : PHONE_STAGE_NOTE;
  return { fullscreen, orientationLocked, note };
}

export function phoneStageCaps(root: { requestFullscreen?: () => Promise<void> } | null | undefined): PhoneStageCaps {
  const fullscreen = root && typeof root.requestFullscreen === "function" ? () => root.requestFullscreen!() : undefined;
  const orientation =
    typeof screen === "undefined" ? undefined : (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> });
  const orientationLock = orientation && typeof orientation.lock === "function" ? (mode: "landscape") => orientation.lock!(mode) : undefined;
  return { fullscreen, orientationLock };
}
