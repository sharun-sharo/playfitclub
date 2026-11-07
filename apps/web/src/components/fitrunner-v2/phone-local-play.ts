import { scheduleContains, type CourseLevel } from "@fitplay/shared";
import { readMotionDiagFlag, trackingStatusLine } from "../join/phone-commands";
import { playCalories, type PlayCalorieView } from "../../lib/fitrunner-v2/play-calories";
import { BODY_LEFT_MESSAGE } from "../../lib/vision/camera-status";
import { containFrame } from "../../lib/vision/preview-fit";
import { isTelevisionUserAgent } from "./tv-graphics";

/** Choose Your Play Mode hub. Marketing CTAs land here before phone or laptop Fit Run. */
export const PLAY_HUB_PATH = "/play";

/** Phone runs Fit Run here. A TV or laptop shows this screen through the phone's own mirror. */
export const PHONE_PLAY_PATH = "/play/phone";

/** Play on TV chooser lands here: same phone game, with mirror-to-TV how-to. */
export const PHONE_TV_PLAY_PATH = "/play/phone?display=tv";

/** Laptop browser Fit Run. Camera and 3D course stay on this device. */
export const LAPTOP_PLAY_PATH = "/play/fit-run";

export type PhoneDisplayMode = "phone" | "tv";

/** Reads `?display=tv` from the phone play URL. Anything else is Mobile Only. */
export function phoneDisplayMode(value: string | string[] | undefined | null): PhoneDisplayMode {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().toLowerCase() === "tv" ? "tv" : "phone";
}

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

/** Mobile Only intro. No TV mirror how-to on this path. */
export const PHONE_MIRROR_NOTE =
  "The game stays on this phone. Your phone camera tracks your moves.";

/** Play on TV intro. Game still runs on the phone; the TV only shows a mirrored phone screen. */
export const PHONE_TV_MIRROR_NOTE =
  "The game runs on this phone and uses the phone camera. Mirror this phone screen to your TV — PlayFit does not cast a separate stream.";

/** Platform titles kept for tests and compact references. Detailed steps live in PHONE_TV_MIRROR_GUIDES. */
export const PHONE_MIRROR_GUIDE = ["Samsung Smart View", "Android Cast", "iPhone Screen Mirroring"] as const;

export const PHONE_MIRROR_LINE = PHONE_MIRROR_GUIDE.join(" ");

/** Step-by-step phone → TV mirroring. Shown only on the Play on TV intro. */
export const PHONE_TV_MIRROR_GUIDES = [
  {
    title: "Samsung Smart View",
    steps: [
      "Swipe down from the top of your phone to open Quick Settings.",
      "Tap Smart View (or Screen Mirroring).",
      "Select your Samsung TV, then confirm on the TV if asked.",
    ],
  },
  {
    title: "Android Cast",
    steps: [
      "Swipe down twice and tap Cast / Screen Cast (or open Settings → Connected devices → Cast).",
      "Select your Chromecast or Cast-ready TV.",
      "Choose Cast screen / Entire screen so the TV shows this phone.",
    ],
  },
  {
    title: "iPhone Screen Mirroring",
    steps: [
      "Open Control Center (swipe down from the top-right, or up from the bottom on older iPhones).",
      "Tap Screen Mirroring.",
      "Select your Apple TV or AirPlay-compatible TV, then enter the code if shown.",
    ],
  },
] as const;

/** Laptop Fit Run intro. Pose stays on this browser. */
export const LAPTOP_PLAY_NOTE =
  "Play in this browser. Your laptop camera tracks your body. Frames stay on this device.";
/**
 * How to play Fit Run. Matches the detector: body step, shoulder lean, or arm
 * raise/sideways for lanes (physical left = robot left), squat for duck/roll, jump for jump.
 */
export const FIT_RUN_HOW_TO_PLAY = [
  "Step or lean left/right to change lanes",
  "Raise your left arm sideways to move left",
  "Raise your right arm sideways to move right",
  "Squat to duck under obstacles",
  "Jump to clear obstacles",
] as const;

/** Shown in portrait when landscape lock is unavailable (Play on TV path). */
export const PHONE_ROTATE_LINE = "Turn your phone sideways.";

/**
 * Play on TV keeps landscape. Mobile Only (`display=phone`) is portrait-first:
 * no landscape lock and no sideways prompt.
 */
export function phonePrefersLandscape(display: PhoneDisplayMode) {
  return display === "tv";
}

/** Marketing and device links open the Choose Your Play Mode hub. */
export function homePlayHref(_input?: { userAgent: string; coarsePointer: boolean; viewportWidth: number }) {
  return PLAY_HUB_PATH;
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
 * Largest camera rectangle that fits a stage. The phone calibration screen does not use this.
 * A contained box on that screen left a vertical edge beside the stick figure.
 */
export function phonePreviewFrame(stageWidth: number, stageHeight: number, mediaWidth: number, mediaHeight: number) {
  return containFrame(stageWidth, stageHeight, mediaWidth, mediaHeight);
}

/**
 * The phone camera stays the stylesheet 6×4 sliver. Calibration is a separate black
 * stage and must not pin this element over the screen. A full-bleed box showed the
 * picture; a contained box showed up as a line beside the stick figure.
 */
export function placePhonePreview(
  flip: HTMLElement,
  stage: { clientWidth: number; clientHeight: number },
  video: { videoWidth: number; videoHeight: number },
  shown: boolean,
) {
  void stage;
  void video;
  void shown;
  flip.style.left = "";
  flip.style.top = "";
  flip.style.width = "";
  flip.style.height = "";
  flip.style.right = "";
  flip.style.bottom = "";
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
  // Beat stylesheet min-height:100svh / 100dvh so the canvas cannot outgrow visualViewport
  // (that mismatch shows as a black/sky seam under the course during RUNNING).
  node.style.minWidth = "0";
  node.style.minHeight = "0";
  node.style.maxHeight = `${box.height}px`;
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
export function phoneCameraFailure(error: unknown, device: "phone" | "laptop" = "phone") {
  const where = device === "laptop" ? "laptop" : "phone";
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return `Allow the camera on your ${where}, then try again.`;
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return `No camera was found on this ${where}.`;
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
 * Rotate-to-landscape prompt. Only for Play on TV (or any path that prefers landscape).
 * Mobile Only stays in portrait without this banner.
 */
export function phoneAsksForLandscapeRotate(display: PhoneDisplayMode, width: number, height: number) {
  if (!phonePrefersLandscape(display)) return false;
  return phoneAsksForLandscape(width, height);
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
 * After countdown GO, the WebGL runner may still be loading on a phone.
 * Keep waiting this long before surfacing a stall / retry.
 */
export const PHONE_COURSE_START_STALL_MS = 8000;

/** Shown while GO has fired but beginCourse has not run yet (assets / handle race). */
export const PHONE_COURSE_STARTING_LINE = "Starting…";

export const PHONE_COURSE_START_STALL_MESSAGE =
  "The course is still loading. Stay in frame — tap Try again if this does not clear.";

export type PhoneCourseStartIntent = "start" | "resume" | null;

/**
 * Black calibration stage. After GO, phase is already `running` but `playing` stays
 * false until the Fit Runner handle calls beginCourse. Hiding the stage on phase alone
 * leaves a blank sky-blue canvas on slow iPhone Safari asset loads.
 */
export function phoneShowsCalibrationStage(input: {
  started: boolean;
  playing: boolean;
  phase: string;
}): boolean {
  if (!input.started) return false;
  if (!input.playing) return true;
  return (
    input.phase === "reposition" ||
    input.phase === "finding" ||
    input.phase === "adjust" ||
    input.phase === "calibrating" ||
    input.phase === "ready" ||
    input.phase === "countdown"
  );
}

/** Latch start/resume edges from the calibration machine. */
export function phonePendingCourseAfterEdge(
  pending: PhoneCourseStartIntent,
  edge: { startCourse: boolean; resumeCourse: boolean },
): PhoneCourseStartIntent {
  if (edge.startCourse) return "start";
  if (edge.resumeCourse) return "resume";
  return pending;
}

/** Enter the 3D course once the handle exists. Start needs a fresh beginCourse. */
export function phoneShouldEnterCourse(input: {
  pending: PhoneCourseStartIntent;
  hasHandle: boolean;
  courseBegun: boolean;
}): "start" | "resume" | null {
  if (!input.hasHandle) return null;
  if (input.pending === "start" && !input.courseBegun) return "start";
  if (input.pending === "resume" && input.courseBegun) return "resume";
  return null;
}

/** True when GO (or startCourse) has been pending without beginCourse for too long. */
export function phoneCourseStartStalled(input: {
  pending: PhoneCourseStartIntent;
  courseBegun: boolean;
  pendingSince: number | null;
  now: number;
  stallMs?: number;
}): boolean {
  if (input.pending !== "start" || input.courseBegun) return false;
  if (input.pendingSince === null) return false;
  const limit = input.stallMs ?? PHONE_COURSE_START_STALL_MS;
  return input.now - input.pendingSince >= limit;
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

/**
 * Developer overlay only. `?motiondiag=1` on localhost or 127.0.0.1.
 * Development mode alone does not open it. A production host does not open it.
 */
export function phoneMotionDiagEnabled(search: string, host = "") {
  if (!readMotionDiagFlag(search)) return false;
  const bare = host.trim().toLowerCase().split(":")[0] ?? "";
  return bare === "localhost" || bare === "127.0.0.1";
}

/** Tester query for local portrait keyboard. The value must be exactly `1`. */
export function readPhoneKeyboardFlag(search: string) {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("keyboard") === "1";
}

/**
 * Portrait phone keyboard for local testing only.
 * Needs `?keyboard=1`, then either localhost/127.0.0.1 or a non-production NODE_ENV.
 * Hard-blocked on playfitclub.com so production never gets keyboard controls.
 */
export function phoneKeyboardTestEnabled(
  search: string,
  host = "",
  nodeEnv: string | undefined = process.env.NODE_ENV,
) {
  if (!readPhoneKeyboardFlag(search)) return false;
  const bare = host.trim().toLowerCase().split(":")[0] ?? "";
  if (bare === "playfitclub.com" || bare.endsWith(".playfitclub.com")) return false;
  if (bare === "localhost" || bare === "127.0.0.1") return true;
  return nodeEnv !== "production";
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
  /** Performance clock when detectForVideo started. A queued frame's wait is not in this stamp. */
  inferStartMs?: number | null;
  /** Performance clock when detectForVideo returned. The gesture emit runs after this, in the same turn. */
  inferEndMs?: number | null;
  /** Performance clock of localJump, localRoll, or localStep. */
  callAtMs?: number | null;
  /** Classification clock of this pose sample. */
  poseAtMs?: number | null;
  /** Classification clock of the last emitted gesture. Not the wall time localJump ran. */
  gestureAtMs?: number | null;
  candidateAtMs?: number | null;
  /** gestureAtMs minus candidateAtMs, on the classification clock. */
  candidateToEmitMs?: number | null;
  /** localJump clock minus detectForVideo return. Same performance clock. */
  endToCallMs?: number | null;
  recognition?: string | null;
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
  inferStartMs?: number | null;
  inferEndMs?: number | null;
  callAtMs?: number | null;
  poseAtMs?: number | null;
  gestureAtMs?: number | null;
  candidateToEmitMs?: number | null;
  endToCallMs?: number | null;
  recognition?: string | null;
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

function diagStamp(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}`;
}

function diagGap(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} ms`;
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
    `state ${input.recognition || "—"}`,
    `t pose ${diagStamp(input.poseAtMs)}`,
    `t gesture ${diagStamp(input.gestureAtMs)}`,
    `t infer start ${diagStamp(input.inferStartMs)}`,
    `t infer end ${diagStamp(input.inferEndMs)}`,
    `t call ${diagStamp(input.callAtMs)}`,
    `candidate to emit ${diagGap(input.candidateToEmitMs)}`,
    `end to call ${diagGap(input.endToCallMs)}`,
  ];
}

export const PHONE_TEST_CONTROLS = [
  { label: "Test jump", movementType: "jump" },
  { label: "Test squat", movementType: "squat" },
  { label: "Test left", movementType: "lean_left" },
  { label: "Test right", movementType: "lean_right" },
] as const;
