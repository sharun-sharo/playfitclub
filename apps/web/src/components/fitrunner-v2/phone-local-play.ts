import { readMotionDiagFlag, trackingStatusLine } from "../join/phone-commands";
import { playCalories, type PlayCalorieView } from "../../lib/fitrunner-v2/play-calories";
import { BODY_LEFT_MESSAGE } from "../../lib/vision/camera-status";
import { isTelevisionUserAgent } from "./tv-graphics";

/** Phone runs Fit Run here. A TV or laptop shows this screen through the phone's own mirror. */
export const PHONE_PLAY_PATH = "/play/phone";

/** The game stays on this phone. A TV or laptop shows this screen only through the phone's own mirror. */
export const PHONE_MIRROR_NOTE =
  "The game stays on this phone. A TV or laptop shows this screen only through the phone's own mirror.";

/** Phone mirror controls. This site does not cast the game. */
export const PHONE_MIRROR_GUIDE = ["Samsung Smart View", "Android Cast", "iPhone Screen Mirroring"] as const;

export const PHONE_MIRROR_LINE = PHONE_MIRROR_GUIDE.join(" ");

/** Shown in portrait when landscape lock is unavailable. */
export const PHONE_ROTATE_LINE = "Turn your phone sideways.";

/** Phone visitors open the phone game. A laptop or television keeps the laptop Fit Run page. */
export function homePlayHref(input: { userAgent: string; coarsePointer: boolean; viewportWidth: number }) {
  if (isPhonePlayVisitor(input)) return PHONE_PLAY_PATH;
  return "/play/fit-run";
}

export function isPhonePlayVisitor(input: { userAgent: string; coarsePointer: boolean; viewportWidth: number }) {
  if (isTelevisionUserAgent(input.userAgent)) return false;
  if (/iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Windows Phone/i.test(input.userAgent)) return true;
  return input.coarsePointer && input.viewportWidth > 0 && input.viewportWidth < 900;
}

export const PHONE_STAND_LINE = "Stand where the camera sees you.";

export const PHONE_TEST_CONTROLS_LABEL = "Test controls";

/** Drawing-buffer cap for /play/phone only. Laptop and TV sessions keep their own caps. */
export const PHONE_PIXEL_RATIO_CAP = 1.5;

export type PhoneBodyPhase = "looking" | "detected" | "ready";

export const PHONE_BODY_LABEL: Record<PhoneBodyPhase, string> = {
  looking: "Looking",
  detected: "Detected",
  ready: "Ready",
};

export type LocalGameCall =
  | { call: "jump" }
  | { call: "roll" }
  | { call: "stepLane"; direction: -1 | 1 };

/**
 * The keyboard on a laptop calls jump, roll, and stepLane.
 * A confirmed phone gesture uses that same call. Nothing here is a socket event.
 */
export const KEYBOARD_GAME_ACTIONS = {
  jump: { call: "jump" },
  squat: { call: "roll" },
  lean_left: { call: "stepLane", direction: -1 },
  lean_right: { call: "stepLane", direction: 1 },
} as const;

export function phonePixelRatio(devicePixelRatio: number) {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(ratio, PHONE_PIXEL_RATIO_CAP);
}

export function phoneBodyPhase(input: { poseCount: number; calibrated: boolean }): PhoneBodyPhase {
  if (input.calibrated) return "ready";
  if (input.poseCount > 0) return "detected";
  return "looking";
}

export function confirmedLocalGesture(movementType: string): LocalGameCall | null {
  if (movementType === "jump") return { call: "jump" };
  if (movementType === "squat") return { call: "roll" };
  if (movementType === "lean_left") return { call: "stepLane", direction: -1 };
  if (movementType === "lean_right") return { call: "stepLane", direction: 1 };
  return null;
}

export type LocalGameControls = {
  jump: () => void;
  roll: () => void;
  stepLane: (direction: -1 | 1) => void;
};

/** One confirmed gesture, one game call, in this turn. */
export function dispatchLocalGesture(movementType: string, game: LocalGameControls) {
  const action = confirmedLocalGesture(movementType);
  if (!action) return false;
  if (action.call === "jump") game.jump();
  else if (action.call === "roll") game.roll();
  else game.stepLane(action.direction);
  return true;
}

/** Camera copy for this page. The laptop join page keeps its own lines. */
export function phoneCameraFailure(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Allow the camera on your phone, then try again.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "No camera was found on this phone.";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "The camera is in use by another app. Close it, then try again.";
  if (name === "SecurityError") return "This page is not secure yet. Open the https link, then try again.";
  return "The camera could not start. Try again.";
}

/** Portrait viewport. Callers ask the player to rotate. They do not lock the OS orientation. */
export function phoneAsksForLandscape(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  return height >= width;
}

/**
 * Setup copy from the existing pose phase.
 * Looking uses the stand line. Detected uses the estimator's own guidance.
 */
export function phoneSetupLine(phase: PhoneBodyPhase, guidance: string | null) {
  if (phase === "ready") return "The game is on this phone.";
  if (phase === "looking") return PHONE_STAND_LINE;
  const text = guidance?.trim();
  if (text) return text;
  return "Hold still.";
}

export function phoneTrackingStatus(input: { playing: boolean; poseCount: number; calibrated: boolean }) {
  const phase = input.playing ? "PLAYING" : input.calibrated ? "READY" : input.poseCount > 0 ? "POSITIONING" : "DETECTING_PLAYER";
  return trackingStatusLine(phase, input.poseCount, null);
}

/** Sustained framing loss from the existing monitor. One empty sample is not enough. */
export function phoneFrameWarning(input: { playing: boolean; banner: boolean; pause: boolean }) {
  if (!input.playing) return null;
  if (input.pause || input.banner) return BODY_LEFT_MESSAGE;
  return null;
}

/**
 * Preview visibility is paint. The pose callback still applies while the preview is hidden.
 * `previewVisible` is part of the call so a hide button cannot grow a second gate.
 */
export function applyLocalPose(input: {
  playing: boolean;
  previewVisible: boolean;
  movementType: string;
  eventId: string;
  seen: Set<string>;
  game: LocalGameControls;
}) {
  void input.previewVisible;
  if (!input.playing) return false;
  if (!input.eventId || input.seen.has(input.eventId)) return false;
  const applied = dispatchLocalGesture(input.movementType, input.game);
  if (!applied) return false;
  input.seen.add(input.eventId);
  if (input.seen.size > 80) {
    const oldest = input.seen.values().next().value;
    if (oldest) input.seen.delete(oldest);
  }
  return true;
}

/** Dash when weight is unknown or the camera clock is not live. Otherwise the existing kcal formula. */
export function phonePlayCalories(input: {
  weightKg: number | null | undefined;
  cameraActiveMs: number;
  cameraLive: boolean;
}): PlayCalorieView {
  if (!input.cameraLive || input.weightKg === undefined) return { kcal: null, text: "—", note: null };
  return playCalories({
    weightKg: input.weightKg,
    cameraActiveMs: input.cameraActiveMs,
    keyboardOnly: false,
  });
}

/** Developer overlay only. `?motiondiag=1`. Development mode alone does not open it. */
export function phoneMotionDiagEnabled(search: string) {
  return readMotionDiagFlag(search);
}

export function renderLoopFps(samples: readonly number[]) {
  if (samples.length < 2) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) return null;
  const span = last - first;
  if (!Number.isFinite(span) || span <= 0) return null;
  return ((samples.length - 1) * 1000) / span;
}

/** Milliseconds from gesture confirm to the local jump, roll, or stepLane call. */
export function confirmToGameMs(confirmMs: number | null | undefined, calledAtMs: number) {
  if (typeof confirmMs !== "number" || !Number.isFinite(confirmMs)) return null;
  if (!Number.isFinite(calledAtMs)) return null;
  const delta = calledAtMs - confirmMs;
  if (!Number.isFinite(delta) || delta < 0) return null;
  return Math.round(delta);
}

export type PhoneMotionDiag = {
  renderFps: number | null;
  inferenceMs: number | null;
  confidence: number | null;
  lastAction: string | null;
  confirmToCallMs: number | null;
};

export function phoneMotionDiagLines(input: PhoneMotionDiag) {
  const fps = input.renderFps === null || !Number.isFinite(input.renderFps) ? "—" : input.renderFps.toFixed(1);
  const inference = input.inferenceMs === null || !Number.isFinite(input.inferenceMs) ? "—" : `${input.inferenceMs.toFixed(1)} ms`;
  const confidence =
    input.confidence === null || !Number.isFinite(input.confidence) ? "—" : `${Math.round(Math.max(0, Math.min(1, input.confidence)) * 100)}%`;
  const lag = input.confirmToCallMs === null || !Number.isFinite(input.confirmToCallMs) ? "—" : `${Math.round(input.confirmToCallMs)} ms`;
  return [
    `render ${fps} fps`,
    `inference ${inference}`,
    `confidence ${confidence}`,
    `action ${input.lastAction || "—"}`,
    `confirm to call ${lag}`,
  ];
}

export const PHONE_TEST_CONTROLS = [
  { label: "Test jump", movementType: "jump" },
  { label: "Test squat", movementType: "squat" },
  { label: "Test left", movementType: "lean_left" },
  { label: "Test right", movementType: "lean_right" },
] as const;
