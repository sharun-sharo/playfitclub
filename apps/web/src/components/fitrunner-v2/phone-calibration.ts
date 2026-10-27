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
 * not open this start gate. There is no distance sensor. Too close means the
 * head or a knee is outside the image. Too far means the body is a speck.
 * Empty space around a visible body is not required.
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

export const PHONE_GUIDANCE = [
  "Move farther",
  "Move closer",
  "Center your body",
  "Keep your knees visible",
  "Hold still",
  "Full body detected",
  "Improve lighting",
] as const;
export type PhoneGuidance = (typeof PHONE_GUIDANCE)[number];

/**
 * Phone start order. A practice jump is not one of these steps.
 * WAITING_FOR_PERSON → CHECKING_VISIBILITY → CHECKING_STABILITY →
 * COLLECTING_BASELINE → CALIBRATED → READY_TO_PLAY.
 */
export type PhoneCalibMachine =
  | "WAITING_FOR_PERSON"
  | "CHECKING_VISIBILITY"
  | "CHECKING_STABILITY"
  | "COLLECTING_BASELINE"
  | "CALIBRATED"
  | "READY_TO_PLAY";

/**
 * Image fractions. Too far is a tiny torso or head-to-knee span.
 * A large torso is still in range when the head and knees are inside the image.
 */
const PHONE_EDGE = 0.04;
const PHONE_CENTER_MIN = 0.36;
const PHONE_CENTER_MAX = 0.64;
const PHONE_TORSO_FAR = 0.11;
const PHONE_SPAN_FAR = 0.3;

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
  machine: PhoneCalibMachine;
}

export interface PhoneCalibSample {
  now: number;
  signal: PhoneBodySignal;
  guidance?: PhoneGuidance | null;
  /** Existing play-profile pause. Already waited about pauseMs. Ignored once repositioning. */
  framingPause?: boolean;
  /**
   * False while the median baseline is still being collected after the 2s hold.
   * Omitted means the caller is not collecting, so the 2s clock can open Ready.
   */
  baselineReady?: boolean;
}

export interface PhoneStageCaps {
  fullscreen?: () => Promise<void>;
  orientationLock?: (orientation: "landscape") => Promise<void>;
}

export type PhoneFullscreenOptions = { navigationUI?: "hide" | "show" | "auto" };

export type PhoneFullscreenTarget = {
  requestFullscreen?: (options?: PhoneFullscreenOptions) => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
};

/** Entering or leaving fullscreen stays on this screen. It does not return to Play. */
export function phoneFullscreenKeepsPlay(started: boolean) {
  return started;
}

export function canRequestPhoneFullscreen(node: PhoneFullscreenTarget | null | undefined) {
  if (!node) return false;
  return typeof node.requestFullscreen === "function" || typeof node.webkitRequestFullscreen === "function";
}

function callPhoneFullscreen(node: PhoneFullscreenTarget): Promise<void> | null {
  if (typeof node.requestFullscreen === "function") {
    try {
      return Promise.resolve(node.requestFullscreen({ navigationUI: "hide" }));
    } catch {
      try {
        return Promise.resolve(node.requestFullscreen());
      } catch {
        /* This node rejected the standard call. Try the prefixed one, then another node. */
      }
    }
  }
  if (typeof node.webkitRequestFullscreen === "function") {
    try {
      return Promise.resolve(node.webkitRequestFullscreen());
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Fullscreen starts in this turn. The game root is preferred so the canvas covers the screen.
 * navigationUI hide is passed when that options object is accepted. A node that cannot go
 * fullscreen falls through to the document element. The returned promise may still reject.
 */
export function requestPhoneFullscreen(root: PhoneFullscreenTarget | null | undefined, documentElement?: PhoneFullscreenTarget | null): Promise<void> {
  const started = (root ? callPhoneFullscreen(root) : null) ?? (documentElement ? callPhoneFullscreen(documentElement) : null);
  if (!started) return Promise.reject(new Error("fullscreen unavailable"));
  return started;
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
    machine: "WAITING_FOR_PERSON",
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

/**
 * Older framing-code labels. The phone gate below measures the body itself.
 * These strings stay so a code still maps onto the same on-screen words.
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
      return "Move farther";
    case "too_far":
      return "Move closer";
    case "move_left":
    case "move_right":
      return "Center your body";
    case "good":
      return input.fullBody && input.straight ? "Full body detected" : "Hold still";
    case "keep_feet":
      return "Keep your knees visible";
    case "tilt_up":
    case "tilt_down":
    case "arm_space":
    case "adjust_camera":
      return "Hold still";
    default:
      return null;
  }
}

const PHONE_GATE_JOINTS = [
  PHONE_START_LANDMARKS.head,
  PHONE_START_LANDMARKS.leftShoulder,
  PHONE_START_LANDMARKS.rightShoulder,
  PHONE_START_LANDMARKS.leftHip,
  PHONE_START_LANDMARKS.rightHip,
  PHONE_START_LANDMARKS.leftKnee,
  PHONE_START_LANDMARKS.rightKnee,
] as const;

function visibilityOf(landmarks: Array<FramingLandmark | null | undefined> | null | undefined, index: number) {
  const point = landmarks?.[index];
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return 0;
  return point.visibility ?? 0;
}

/** Clears the visibility floor. The point may still sit outside the image. */
function confidentJoint(
  landmarks: Array<FramingLandmark | null | undefined> | null | undefined,
  index: number,
  minVisibility: number,
) {
  const point = landmarks?.[index];
  if (!point || (point.visibility ?? 0) < minVisibility) return null;
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return point;
}

function placedJoint(
  landmarks: Array<FramingLandmark | null | undefined> | null | undefined,
  index: number,
  minVisibility: number,
) {
  const point = confidentJoint(landmarks, index, minVisibility);
  if (!point || !inCameraFrame(point)) return null;
  return point;
}

function cutOff(point: FramingLandmark | null) {
  return Boolean(point && !inCameraFrame(point));
}

/**
 * One frame of the phone gate. Ankles are not read.
 * Ready requires one person, head through knees inside the image, roughly centered,
 * and a body that is not a distant speck.
 * Standing closer still passes when those joints are in frame. A large torso is not too close.
 * Too close means the head or a knee is outside the image.
 */
export function phoneBodyGate(input: {
  poseCount: number;
  landmarks: Array<FramingLandmark | null | undefined> | null;
  minVisibility?: number;
}): { signal: PhoneBodySignal; fullBody: boolean; straight: boolean; guidance: PhoneGuidance | null; standing: boolean } {
  const minVisibility = input.minVisibility ?? PHONE_VISIBILITY_FLOOR;
  const empty = { signal: "none" as const, fullBody: false, straight: false, guidance: null, standing: false };
  if (input.poseCount <= 0) return empty;
  if (input.poseCount !== 1) return { ...empty, signal: "partial" };
  const seen = PHONE_GATE_JOINTS.map((index) => visibilityOf(input.landmarks, index)).filter((value) => value > 0);
  if (seen.length === 0) return empty;
  if (seen.every((value) => value < minVisibility)) {
    return { signal: "partial", fullBody: false, straight: false, guidance: "Improve lighting", standing: false };
  }
  const head = placedJoint(input.landmarks, PHONE_START_LANDMARKS.head, minVisibility);
  const leftShoulder = placedJoint(input.landmarks, PHONE_START_LANDMARKS.leftShoulder, minVisibility);
  const rightShoulder = placedJoint(input.landmarks, PHONE_START_LANDMARKS.rightShoulder, minVisibility);
  const leftHip = placedJoint(input.landmarks, PHONE_START_LANDMARKS.leftHip, minVisibility);
  const rightHip = placedJoint(input.landmarks, PHONE_START_LANDMARKS.rightHip, minVisibility);
  const leftKnee = placedJoint(input.landmarks, PHONE_START_LANDMARKS.leftKnee, minVisibility);
  const rightKnee = placedJoint(input.landmarks, PHONE_START_LANDMARKS.rightKnee, minVisibility);
  const fullBody = Boolean(head && leftShoulder && rightShoulder && leftHip && rightHip && leftKnee && rightKnee);
  const straight = phoneShouldersLevel(input.landmarks, minVisibility);
  const headCut = cutOff(confidentJoint(input.landmarks, PHONE_START_LANDMARKS.head, minVisibility));
  const kneesCut =
    cutOff(confidentJoint(input.landmarks, PHONE_START_LANDMARKS.leftKnee, minVisibility)) ||
    cutOff(confidentJoint(input.landmarks, PHONE_START_LANDMARKS.rightKnee, minVisibility));
  if (!leftKnee || !rightKnee) {
    if (kneesCut || headCut) {
      return { signal: "partial", fullBody: false, straight, guidance: "Move farther", standing: false };
    }
    return { signal: "partial", fullBody: false, straight, guidance: "Keep your knees visible", standing: false };
  }
  if (!head || !leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    const shouldersHigh = Boolean(leftShoulder && rightShoulder && Math.min(leftShoulder.y, rightShoulder.y) <= PHONE_EDGE);
    return {
      signal: "partial",
      fullBody: false,
      straight,
      guidance: !head || shouldersHigh ? "Move farther" : "Hold still",
      standing: false,
    };
  }
  const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipX = (leftHip.x + rightHip.x) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  const torso = Math.hypot(hipX - shoulderX, hipY - shoulderY);
  const span = Math.max(leftKnee.y, rightKnee.y) - head.y;
  const center = (shoulderX + hipX) / 2;
  if (torso <= PHONE_TORSO_FAR || span <= PHONE_SPAN_FAR) {
    return { signal: "partial", fullBody, straight, guidance: "Move closer", standing: false };
  }
  if (center < PHONE_CENTER_MIN || center > PHONE_CENTER_MAX) {
    return { signal: "partial", fullBody, straight, guidance: "Center your body", standing: false };
  }
  if (!straight) return { signal: "partial", fullBody, straight: false, guidance: "Hold still", standing: false };
  return { signal: "full", fullBody: true, straight: true, guidance: "Full body detected", standing: true };
}

export function phoneBodyReading(input: {
  poseCount: number;
  landmarks: Array<FramingLandmark | null | undefined> | null;
  framingCode: FramingCode | null;
  minVisibility?: number;
}): { signal: PhoneBodySignal; fullBody: boolean; straight: boolean; guidance: PhoneGuidance | null; standing: boolean } {
  void input.framingCode;
  return phoneBodyGate(input);
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
      if (sample.baselineReady === false) {
        return {
          ...state,
          phase: positioningPhase(state.runStarted, "calibrating"),
          status: "Calibrating",
          guidance: "Hold still",
          holdStartedAt,
          lastFullAt,
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
        phase: "ready",
        status: "Ready",
        guidance: "Full body detected",
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
      guidance: sample.signal === "full" ? "Hold still" : sample.guidance ?? state.guidance,
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

export function phoneCalibMachine(
  state: Pick<PhoneCalibState, "phase" | "status" | "holdStartedAt">,
  sample?: Pick<PhoneCalibSample, "now" | "baselineReady">,
  stableMs = PHONE_CALIB_CONFIG.stableMs,
): PhoneCalibMachine {
  if (state.phase === "finding") return "WAITING_FOR_PERSON";
  if (state.phase === "adjust") return "CHECKING_VISIBILITY";
  if (state.phase === "reposition") return state.status === "Finding Player" ? "WAITING_FOR_PERSON" : "CHECKING_VISIBILITY";
  if (state.phase === "calibrating") {
    const held = state.holdStartedAt !== null && sample !== undefined && sample.now - state.holdStartedAt >= stableMs;
    if (held && sample?.baselineReady === false) return "COLLECTING_BASELINE";
    return "CHECKING_STABILITY";
  }
  if (state.phase === "ready") return "CALIBRATED";
  return "READY_TO_PLAY";
}

export function stepPhoneCalibration(state: PhoneCalibState, sample: PhoneCalibSample, config: PhoneCalibConfig = PHONE_CALIB_CONFIG): PhoneCalibState {
  const base = clearEdges(state);
  const next = base.phase === "running" || base.phase === "warning" ? stepRun(base, sample, config) : stepPosition(base, sample, config);
  return { ...next, machine: phoneCalibMachine(next, sample, config.stableMs) };
}

export const PHONE_PLAY_STARTED_KEY = "fitplay.phone.playStarted";

type PhonePlayStore = {
  getItem?(key: string): string | null;
  setItem?(key: string, value: string): void;
};

/** Survives an orientation reload. A React remount reads this and must not return to Play. */
export function rememberPhonePlayStarted(storage: PhonePlayStore | null | undefined) {
  try {
    storage?.setItem?.(PHONE_PLAY_STARTED_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function readPhonePlayStarted(storage: PhonePlayStore | null | undefined) {
  try {
    return storage?.getItem?.(PHONE_PLAY_STARTED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Play tap. Leaves the intro in this turn and requests the camera before any
 * await. Fullscreen and landscape lock run beside that. A rejection or a hung
 * lock must not skip the camera and must not keep the caller on the intro.
 */
export function startPhonePlay<T>(input: {
  requestCamera: () => Promise<T> | T;
  /** null skips a second fullscreen or orientation request after this session already asked. */
  stage?: PhoneStageCaps | null;
  onLeaveIntro: () => void;
  onStage?: (result: { fullscreen: boolean; orientationLocked: boolean; note: string | null }) => void;
}): { camera: Promise<T>; leftIntro: true } {
  input.onLeaveIntro();
  let camera: Promise<T>;
  try {
    camera = Promise.resolve(input.requestCamera());
  } catch (error) {
    camera = Promise.reject(error);
  }
  if (input.stage !== null) {
    const stage = requestPhoneStage(input.stage ?? {});
    if (input.onStage) void stage.then((result) => input.onStage?.(result));
  }
  return { camera, leftIntro: true };
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

export function phoneStageCaps(root: PhoneFullscreenTarget | null | undefined): PhoneStageCaps {
  const documentElement = typeof document === "undefined" ? null : (document.documentElement as PhoneFullscreenTarget);
  const fullscreen =
    canRequestPhoneFullscreen(root) || canRequestPhoneFullscreen(documentElement)
      ? () => requestPhoneFullscreen(root, documentElement)
      : undefined;
  const orientation =
    typeof screen === "undefined" ? undefined : (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> });
  const orientationLock = orientation && typeof orientation.lock === "function" ? (mode: "landscape") => orientation.lock!(mode) : undefined;
  return { fullscreen, orientationLock };
}
