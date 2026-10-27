import { scheduleContains, type CourseLevel } from "@fitplay/shared";
import { readMotionDiagFlag, trackingStatusLine } from "../join/phone-commands";
import { playCalories, type PlayCalorieView } from "../../lib/fitrunner-v2/play-calories";
import { BODY_LEFT_MESSAGE } from "../../lib/vision/camera-status";
import { containFrame } from "../../lib/vision/preview-fit";
import { isTelevisionUserAgent } from "./tv-graphics";

/** Phone runs Fit Run here. A TV or laptop shows this screen through the phone's own mirror. */
export const PHONE_PLAY_PATH = "/play/phone";

/** Shown beside the intro QR. The address itself stays inside the code. */
export const PHONE_LAPTOP_QR_LINE = "If you opened this on a laptop, scan this with your phone.";

/** Accessible name for the intro QR. It does not include the page address. */
export const PHONE_LAPTOP_QR_NAME = "QR code to open this game on your phone";

/**
 * Absolute address encoded by the intro QR.
 * Uses the page origin so each host, including a non-production one, encodes its own page.
 */
export function phonePlayQrPayload(origin: string) {
  const base = origin.trim().replace(/\/+$/, "");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(base)) return "";
  return `${base}${PHONE_PLAY_PATH}`;
}

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

/**
 * Balanced device-pixel-ratio cap. The live phone route picks low, balanced, or
 * high in phone-draw.ts and also limits the long edge. Laptop and TV sessions
 * do not use this cap. The television buffer stays 960×540.
 */
export const PHONE_PIXEL_RATIO_CAP = 1.5;

/**
 * A few painted pixels once the course is on screen.
 * Samsung Internet presents no new camera frames when this video is opacity 0,
 * visibility hidden, display none, or fully covered by the game canvas.
 * The element stays composited: non-zero size, opacity at least 0.02, above the
 * WebGL canvas. It is not a camera picture the player can recognize.
 */
export const PHONE_LIVE_CAMERA = { width: 6, height: 4, opacity: 0.02 } as const;

/** A zero-size or fully hidden video does not present. A few painted pixels still do. */
export function phoneLiveCameraKeepsFrames(box: { width: number; height: number; opacity?: number; hidden?: boolean }) {
  if (box.hidden) return false;
  if (typeof box.opacity === "number" && !(box.opacity >= PHONE_LIVE_CAMERA.opacity)) return false;
  return box.width > 0 && box.height > 0;
}

/** Phone HUD corner. A television width must not stretch this into a side panel. */
export const PHONE_HUD_CARD_PX = 168;

export function phoneHudCardWidth(viewportWidth: number) {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return PHONE_HUD_CARD_PX;
  return Math.min(PHONE_HUD_CARD_PX, Math.floor(viewportWidth));
}

export interface PhoneViewportBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function finiteBox(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * The visible area under the URL bar. `100dvh` is the stylesheet fallback.
 * Samsung Internet often refuses to hide that bar; the game still fills this box.
 */
export function phonePlayViewportBox(input: {
  innerWidth: number;
  innerHeight: number;
  visualWidth?: number;
  visualHeight?: number;
  offsetLeft?: number;
  offsetTop?: number;
}): PhoneViewportBox {
  const visualWidth = finiteBox(input.visualWidth);
  const visualHeight = finiteBox(input.visualHeight);
  const innerWidth = finiteBox(input.innerWidth);
  const innerHeight = finiteBox(input.innerHeight);
  return {
    left: finiteBox(input.offsetLeft),
    top: finiteBox(input.offsetTop),
    width: visualWidth > 0 ? visualWidth : Math.max(0, innerWidth),
    height: visualHeight > 0 ? visualHeight : Math.max(0, innerHeight),
  };
}

/**
 * Largest camera rectangle that fits a stage. Calibration does not use this.
 * A contained box leaves a vertical edge on the setup screen.
 */
export function phonePreviewFrame(stageWidth: number, stageHeight: number, mediaWidth: number, mediaHeight: number) {
  return containFrame(stageWidth, stageHeight, mediaWidth, mediaHeight);
}

/**
 * Calibration covers the stage. The in-run path clears these inline sizes so the
 * 6×4 stylesheet sliver can paint. A contained camera rectangle is not pinned here:
 * its right edge showed up as a line beside the stick figure.
 */
export function placePhonePreview(
  flip: HTMLElement,
  stage: { clientWidth: number; clientHeight: number },
  video: { videoWidth: number; videoHeight: number },
  shown: boolean,
) {
  void stage;
  void video;
  if (!shown) {
    flip.style.left = "";
    flip.style.top = "";
    flip.style.width = "";
    flip.style.height = "";
    flip.style.right = "";
    flip.style.bottom = "";
    return;
  }
  flip.style.left = "0";
  flip.style.top = "0";
  flip.style.right = "auto";
  flip.style.bottom = "auto";
  flip.style.width = "100%";
  flip.style.height = "100%";
}

/** Pins the play root and the WebGL canvas to the visual viewport. */
export function applyPhonePlayViewport(node: HTMLElement, box: PhoneViewportBox) {
  node.style.position = "fixed";
  node.style.left = `${box.left}px`;
  node.style.top = `${box.top}px`;
  node.style.width = `${box.width}px`;
  node.style.height = `${box.height}px`;
  node.style.right = "auto";
  node.style.bottom = "auto";
  node.style.maxWidth = "none";
}

/** Same rule as the server seed: 0 is not a seed. The phone course does not wait on Railway. */
export function phoneRunSeed(randomUint: number) {
  if (!Number.isFinite(randomUint)) return 1;
  const value = randomUint >>> 0;
  return value === 0 ? 1 : value;
}

/** A palm, a token, or any id outside this run's schedule does not spend a life. */
export function phoneObstacleCounts(seed: number, ceiling: CourseLevel, obstacleId: string) {
  if (!Number.isFinite(seed) || seed <= 0) return false;
  return scheduleContains(seed >>> 0, ceiling, obstacleId);
}

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
  buffer: string | null;
  renderFps: number | null;
  poseFps: number | null;
  inferenceMs: number | null;
  candidate: string | null;
  confirmed: string | null;
  confirmToCallMs: number | null;
  reject: string | null;
  camera?: string | null;
  confidence?: number | null;
  stability?: string | null;
  calibration?: string | null;
  baseline?: string | null;
  hip?: number | null;
  shoulder?: number | null;
  knee?: number | null;
};

export interface PhoneMotionLogRecord {
  t: number;
  camera: string | null;
  confidence: number | null;
  calibration: string | null;
  candidate: string | null;
  confirmed: string | null;
  reject: string | null;
  hip: number | null;
  shoulder: number | null;
  knee: number | null;
  gameFps: number | null;
  poseFps: number | null;
  inferenceMs: number | null;
  confirmToCallMs: number | null;
}

/** Local download only. Timestamps and decisions. No picture, name, or token. */
export function phoneMotionLogText(records: readonly PhoneMotionLogRecord[]) {
  return JSON.stringify(records);
}

export function phoneGestureCandidate(input: {
  squatPhase?: string | null;
  jumpPhase?: string | null;
  leanPhase?: string | null;
  leftPhase?: string | null;
  rightPhase?: string | null;
  takeoffPhase?: string | null;
} | null) {
  if (!input) return "none";
  const jump =
    input.jumpPhase === "CANDIDATE" || input.takeoffPhase === "TAKEOFF_CANDIDATE" || input.takeoffPhase === "PREPARING";
  const parts = [
    input.squatPhase === "CANDIDATE" ? "squat" : "",
    jump ? "jump" : "",
    input.leanPhase === "CANDIDATE" ? "lean" : "",
    input.leftPhase === "ARM_RISING" ? "left" : "",
    input.rightPhase === "ARM_RISING" ? "right" : "",
  ].filter(Boolean);
  return parts.join("+") || "none";
}

function diagNumber(value: number | null | undefined, digits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function phoneMotionDiagLines(input: PhoneMotionDiag) {
  const fps = input.renderFps === null || !Number.isFinite(input.renderFps) ? "—" : input.renderFps.toFixed(1);
  const pose = input.poseFps === null || !Number.isFinite(input.poseFps) ? "—" : input.poseFps.toFixed(1);
  const inference = input.inferenceMs === null || !Number.isFinite(input.inferenceMs) ? "—" : `${input.inferenceMs.toFixed(1)} ms`;
  const lag = input.confirmToCallMs === null || !Number.isFinite(input.confirmToCallMs) ? "—" : `${Math.round(input.confirmToCallMs)} ms`;
  const knee = typeof input.knee === "number" && Number.isFinite(input.knee) ? `${input.knee.toFixed(0)}` : "—";
  return [
    `camera ${input.camera || "—"}`,
    `confidence ${diagNumber(input.confidence, 2)}`,
    `stability ${input.stability || "—"}`,
    `calibration ${input.calibration || "—"}`,
    `baseline ${input.baseline || "—"}`,
    `hip ${diagNumber(input.hip)}`,
    `shoulder ${diagNumber(input.shoulder)}`,
    `knee ${knee}`,
    `buffer ${input.buffer || "—"}`,
    `game ${fps} fps`,
    `pose ${pose} fps`,
    `inference ${inference}`,
    `candidate ${input.candidate || "none"}`,
    `confirmed ${input.confirmed || "none"}`,
    `confirm to call ${lag}`,
    `reject ${input.reject || "none"}`,
  ];
}

export const PHONE_TEST_CONTROLS = [
  { label: "Test jump", movementType: "jump" },
  { label: "Test squat", movementType: "squat" },
  { label: "Test left", movementType: "lean_left" },
  { label: "Test right", movementType: "lean_right" },
] as const;
