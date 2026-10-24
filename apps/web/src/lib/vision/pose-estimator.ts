import {
  adaptThresholds,
  alignLandmarkDepth,
  calibrationThresholds,
  calibrateNeutral,
  createDetector,
  createMotionCalibration,
  noteBodyScale,
  observeMotionCalibration,
  pushPose,
  setNeutral,
  setThresholds,
  resetMovementReady,
  settleGestures,
  type DetectorState,
  type DetectorUpdate,
  type MotionCalibration,
  type MovementDraft,
  type MovementThresholds,
  type PoseFrame,
} from "@fitplay/game";
import { CAMERA_LOST_MESSAGE, classifyCameraError } from "@/lib/vision/camera-status";
import { frontCameraAttempts, frontCameraFallback, portraitScore } from "@/lib/vision/front-camera";
import {
  CALIBRATION_HOLD,
  createFramingMonitor,
  gestureAllowed,
  LOST_YOU,
  PLAY_BANNER,
  type FramingView,
} from "@/lib/vision/framing";

type Facing = "user" | "environment";

export interface PoseDiagnostics {
  phase: string;
  confidence: number;
  leftElbow: number;
  rightElbow: number;
  leftLateral: number;
  rightLateral: number;
  hipDrop: number;
  kneeAngle: number;
  riseSpeed: number;
  ankleRise: number;
  reject: string | null;
  leftPhase?: string;
  rightPhase?: string;
  squatPhase?: string;
  jumpPhase?: string;
  lastGesture?: string | null;
  mirrored: boolean;
  orientation: string;
  bodyVisibility: number;
  leftElevation: number;
  rightElevation: number;
  leftReach: number;
  rightReach: number;
  /** Wrist below the shoulder, in torso lengths. Positive is below the shoulder. */
  leftHeight: number;
  rightHeight: number;
  /** Outward travel from the calibrated hang, in shoulder widths. */
  leftOutward: number;
  rightOutward: number;
  hipVelocity: number;
  ankleVelocity: number;
  ankleFlex: number;
  kneeFlex: number;
  jumpMotion: string;
  cooldownMs: number;
  /** Phone performance clock for this frame. Not Date.now(). */
  poseAtMs: number;
  /** Phone performance clock when the gesture was confirmed. Same clock as poseAtMs. */
  gestureAtMs: number | null;
  eventId: string | null;
  joints: string | null;
}

export interface PoseRates {
  cameraFps: number | null;
  poseFps: number | null;
  inferenceMs: number | null;
}

export interface PoseUiState {
  guidance: string;
  confidence: number;
  framingReady: boolean;
  calibrated: boolean;
  movement: string | null;
  actionsEnabled: boolean;
  diagnostics: PoseDiagnostics | null;
  framing: FramingView | null;
  rates: PoseRates;
  /** Developer diagnostics only. Not sent to the TV. */
  landmarksLabel: string | null;
  /** Poses returned for this frame. The landmarker is created with numPoses: 1. */
  poseCount: number;
  /** Session coach line for the TV. Null when the race has started or the coach is finished. */
  calibrationCue: string | null;
}

interface PoseHandlers {
  onUi: (state: PoseUiState) => void;
  onMovement: (draft: MovementDraft) => void;
  onCameraLost: (message: string) => void;
}

/**
 * Runs MediaPipe Pose Landmarker locally. Frames, landmarks, and the detector
 * state stay in this class and are never written to storage.
 * Jump detection is a monocular estimate, not a measured jump height.
 */
export class PoseEstimator {
  private landmarker: {
    detectForVideo: (video: HTMLVideoElement, timestamp: number) => {
      landmarks?: Array<Array<{ x: number; y: number; z?: number; visibility?: number }>>;
      worldLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
    };
    close: () => void;
  } | null = null;
  private detector: DetectorState = createDetector({ mirror: true });
  private raf = 0;
  private running = false;
  private mode: "idle" | "calibrate" | "play" = "idle";
  private recent: PoseFrame[] = [];
  private lastUi = 0;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private handlers: PoseHandlers | null = null;
  private facing: Facing = "user";
  private lastDraw = 0;
  private canvasSize = "";
  private actionsOpen = true;
  private lost = false;
  private lastAction = "";
  private lastActionAt = 0;
  private resumePlay = false;
  private cameraFrames = 0;
  private poseFrames = 0;
  private inferenceTotal = 0;
  private inferenceSamples = 0;
  private rateWindowStart = 0;
  private cameraClock = false;
  private rates: PoseRates = { cameraFps: null, poseFps: null, inferenceMs: null };
  private framing = createFramingMonitor();
  private lastFramingKey = "";
  /** Play-profile pause is armed only after the race has started. */
  private raceLive = true;
  private landmarkSample: string | null = null;
  /** detectForVideo with numPoses: 1 returns at most one pose. Presence scores are not in the result. */
  private poseCount = 0;
  /** In-memory samples for this page load. Not written to storage. */
  private motion: MotionCalibration = createMotionCalibration();
  private coaching = true;
  private squatFitted = false;

  async load() {
    if (this.landmarker) return;
    const vision = await import("@mediapipe/tasks-vision");
    const files = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const options = {
      baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: "GPU" as const },
      runningMode: "VIDEO" as const,
      // One pose only. The result has no presence score and no second body.
      numPoses: 1,
      minPoseDetectionConfidence: 0.35,
      minPosePresenceConfidence: 0.35,
      minTrackingConfidence: 0.35,
    };
    try {
      this.landmarker = await vision.PoseLandmarker.createFromOptions(files, options);
    } catch {
      this.landmarker = await vision.PoseLandmarker.createFromOptions(files, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "CPU" },
      });
    }
  }

  setFacing(facing: Facing) {
    this.facing = facing;
    this.detector = { ...this.detector, thresholds: { ...this.detector.thresholds, mirror: facing === "user" } };
  }

  start(video: HTMLVideoElement, canvas: HTMLCanvasElement, handlers: PoseHandlers, mode: "calibrate" | "play") {
    this.video = video;
    this.canvas = canvas;
    this.handlers = handlers;
    this.mode = mode;
    this.lost = false;
    this.actionsOpen = true;
    if (this.running) return;
    this.running = true;
    this.armCameraClock(video);
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    this.raf = requestAnimationFrame(loop);
  }

  setMode(mode: "idle" | "calibrate" | "play") {
    if (mode === "play" && this.resumePlay) return;
    this.mode = mode;
    if (mode === "idle") this.stopLoop();
  }

  setThresholds(overrides: Partial<MovementThresholds>) {
    this.detector = setThresholds(this.detector, overrides);
  }

  /** Stops the coach when the round is running so play cues stay on the TV. */
  setCoaching(on: boolean) {
    this.coaching = on;
    if (!on) this.motion = { ...this.motion, instruction: null };
  }

  recalibrate() {
    this.resumePlay = this.mode === "play";
    this.recent = [];
    this.lastAction = "";
    this.detector = createDetector(this.detector.thresholds);
    this.motion = createMotionCalibration(performance.now());
    this.squatFitted = false;
    this.coaching = true;
    this.framing.reset();
    this.mode = "calibrate";
  }

  stop() {
    this.stopLoop();
    this.landmarker?.close();
    this.landmarker = null;
    this.recent = [];
    this.actionsOpen = false;
    this.framing.reset();
    this.motion = createMotionCalibration();
    this.squatFitted = false;
    this.detector = createDetector({ mirror: this.facing === "user" });
  }

  /**
   * Play-profile loss can pause the run. Stay false during camera setup, before GO.
   * The detector can still be in play so tutorial gestures keep working.
   */
  setRaceLive(live: boolean) {
    this.raceLive = live;
  }

  /** Clears a tracking pause and drops any gesture that was in flight. */
  resumeTracking() {
    this.framing.resume();
    this.detector = settleGestures(this.detector);
    if (this.detector.neutral) this.mode = "play";
  }

  /**
   * Play Again, pause, and the return to running.
   * The calibrated stance stays. A jump in the air or a latched squat does not.
   */
  readyForRound() {
    this.detector = resetMovementReady(this.detector);
    this.lastAction = "";
    this.lastActionAt = 0;
  }

  suspend(message: string) {
    if (this.lost) return;
    this.lost = true;
    this.actionsOpen = false;
    this.landmarkSample = null;
    this.stopLoop();
    this.handlers?.onUi({
      guidance: message,
      confidence: 0,
      framingReady: false,
      calibrated: Boolean(this.detector.neutral),
      movement: null,
      actionsEnabled: false,
      diagnostics: null,
      framing: null,
      rates: this.rates,
      landmarksLabel: null,
      poseCount: 0,
      calibrationCue: null,
    });
    this.handlers?.onCameraLost(message);
  }

  private stopLoop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private streamEnded() {
    const source = this.video?.srcObject;
    if (!source || !("getVideoTracks" in source)) return false;
    const tracks = source.getVideoTracks();
    return tracks.length === 0 || tracks.every((track) => track.readyState === "ended");
  }

  private tick() {
    if (this.streamEnded()) {
      this.suspend(CAMERA_LOST_MESSAGE);
      return;
    }
    const video = this.video;
    const landmarker = this.landmarker;
    if (!video || !landmarker || video.readyState < 2 || this.mode === "idle") return;
    const now = performance.now();
    const inferenceStarted = performance.now();
    let result: {
      landmarks?: Array<Array<{ x: number; y: number; z?: number; visibility?: number }>>;
      worldLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
    };
    try {
      result = landmarker.detectForVideo(video, now);
    } catch {
      this.suspend(CAMERA_LOST_MESSAGE);
      return;
    }
    this.sampleRates(now, performance.now() - inferenceStarted);
    this.poseCount = result.landmarks?.length ?? 0;
    if (this.poseCount > 1) {
      this.landmarkSample = null;
      this.draw(undefined);
      const view = this.framingView([], now);
      this.emitUi({
        guidance: "One person at a time",
        confidence: 0,
        framingReady: false,
        calibrated: Boolean(this.detector.neutral),
        movement: null,
        actionsEnabled: false,
        diagnostics: null,
        framing: { ...view, instruction: "One person at a time" },
      }, now);
      return;
    }
    const raw = result.landmarks?.[0];
    this.landmarkSample = formatLandmarkSample(raw);
    if (now - this.lastDraw > 50) {
      this.lastDraw = now;
      this.draw(raw);
    }
    const aspect = video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 1;
    const frame: PoseFrame | null = raw
      ? {
          timestampMs: now,
          landmarks: alignLandmarkDepth(
            raw.map((point) => ({ x: point.x, y: point.y, z: point.z, visibility: point.visibility })),
            result.worldLandmarks?.[0] ?? null,
            aspect,
          ),
        }
      : null;
    const view = this.framingView(frame?.landmarks ?? [], now);
    if (!frame) {
      this.emitUi({
        guidance: this.mode === "play" && view.pause ? LOST_YOU : this.mode === "play" && view.banner ? PLAY_BANNER : view.instruction,
        confidence: 0,
        framingReady: false,
        calibrated: Boolean(this.detector.neutral),
        movement: null,
        actionsEnabled: false,
        diagnostics: null,
        framing: view,
      }, now);
      return;
    }
    if (this.mode === "calibrate") {
      let guidance = view.instruction;
      let playUpdate: DetectorUpdate | null = null;
      if (view.calibrate) {
        this.recent.push(frame);
        this.recent = this.recent.slice(-12);
        const calibration = calibrateNeutral(this.recent, this.detector.thresholds.minVisibility);
        if (calibration.neutral && !this.detector.neutral) {
          this.detector = setNeutral(this.detector, calibration.neutral);
          this.detector = setThresholds(this.detector, adaptThresholds(calibration.neutral, this.detector.thresholds));
          this.motion = noteBodyScale(this.motion, calibration.neutral.torso, calibration.neutral.shoulderWidth, now);
          guidance = calibration.guidance;
          if (this.resumePlay) {
            this.resumePlay = false;
            this.mode = "play";
          }
        } else if (!this.detector.neutral && calibration.guidance.startsWith("Hold still —")) {
          guidance = calibration.guidance;
        } else if (!this.detector.neutral) {
          guidance = CALIBRATION_HOLD;
        }
      } else if (!this.detector.neutral) {
        this.recent = [];
      }
      if (this.detector.neutral && this.mode === "calibrate") {
        playUpdate = pushPose(this.detector, frame);
        this.detector = playUpdate.state;
        this.observeCoach(playUpdate, now, view.code === "good");
        if (this.motion.instruction) guidance = this.motion.instruction;
      }
      const calibrated = Boolean(this.detector.neutral);
      this.emitUi({
        guidance,
        confidence: playUpdate?.signals?.confidence ?? view.confidence,
        framingReady: calibrated && view.code === "good",
        calibrated,
        movement: null,
        actionsEnabled: false,
        diagnostics: playUpdate ? diagnosticsFrom(playUpdate, this.facing === "user", now, raw) : null,
        framing: { ...view, instruction: guidance },
      }, now);
      return;
    }
    const update = pushPose(this.detector, frame);
    this.detector = update.state;
    this.observeCoach(update, now, view.code === "good" && !view.pause);
    const allowed = view.suppressAll ? [] : update.events.filter((event) => gestureAllowed(event.movementType, view.blocks));
    const movement = allowed[0]?.movementType ?? null;
    const confident = Boolean(update.signals?.ok && (update.signals.confidence ?? 0) >= this.detector.thresholds.minActionConfidence);
    if (movement) {
      this.lastAction = movement;
      this.lastActionAt = now;
    }
    if (this.mode === "play" && this.actionsOpen) {
      for (const event of allowed) this.handlers?.onMovement(event);
    }
    const playGuidance = view.pause
      ? LOST_YOU
      : view.banner
      ? PLAY_BANNER
      : view.unavailable && view.code === "good"
        ? view.unavailable
        : view.code === "good"
          ? update.guidance
          : view.instruction;
    this.emitUi({
      guidance: playGuidance,
      confidence: update.signals?.confidence ?? view.confidence,
      framingReady: view.code === "good",
      calibrated: Boolean(this.detector.neutral),
      movement,
      actionsEnabled: this.actionsOpen && confident && !view.suppressAll,
      diagnostics: diagnosticsFrom(update, this.facing === "user", now, raw),
      framing: view,
    }, now);
  }

  private framingView(landmarks: PoseFrame["landmarks"], now: number) {
    return this.framing.push({
      landmarks,
      mirrored: this.facing === "user",
      now,
      profile: this.mode === "play" && this.raceLive ? "play" : "setup",
      minVisibility: this.detector.thresholds.minVisibility,
    });
  }

  private emitUi(state: Omit<PoseUiState, "rates" | "landmarksLabel" | "poseCount" | "calibrationCue">, now: number) {
    const cue = this.coaching ? this.motion.instruction ?? "" : "";
    const key = `${this.poseCount}|${state.framing?.code ?? ""}|${state.framing?.banner}|${state.framing?.pause}|${state.framing?.canResume}|${state.guidance}|${cue}|${state.movement ?? ""}|${state.diagnostics?.reject ?? ""}|${state.diagnostics?.leftPhase ?? ""}|${state.diagnostics?.rightPhase ?? ""}|${state.diagnostics?.jumpMotion ?? ""}|${state.diagnostics?.squatPhase ?? ""}`;
    const changed = key !== this.lastFramingKey;
    const urgent = Boolean(state.movement) || /paused|hidden|No body|lost you/i.test(state.guidance);
    if (!changed && now - this.lastUi < 180 && !urgent) return;
    this.lastFramingKey = key;
    this.lastUi = now;
    this.handlers?.onUi({
      ...state,
      poseCount: this.poseCount,
      landmarksLabel: this.landmarkSample,
      rates: this.rates,
      calibrationCue: this.coaching ? this.motion.instruction : null,
    });
  }

  /** Watches confirmed gestures after the still stance. Does not send them to the game. */
  private observeCoach(update: DetectorUpdate, now: number, framingReady: boolean) {
    if (!this.coaching || this.motion.step === "done" || !this.motion.bodyScale) return;
    const signals = update.signals;
    this.motion = observeMotionCalibration(this.motion, {
      now,
      framingReady,
      movement: update.events[0]?.movementType ?? null,
      leftElevation: signals?.leftArm.elevation ?? 0,
      rightElevation: signals?.rightArm.elevation ?? 0,
      jumpVelocity: Math.max(signals?.hipVelocity ?? 0, signals?.riseSpeed ?? 0),
      squatDrop: signals?.hipDrop ?? 0,
    });
    if (!this.squatFitted && this.motion.squatDrop !== null) {
      this.squatFitted = true;
      this.detector = setThresholds(this.detector, calibrationThresholds(this.motion));
    }
  }

  private armCameraClock(video: HTMLVideoElement) {
    const withFrames = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    };
    if (!withFrames.requestVideoFrameCallback) return;
    const tick = () => {
      if (!this.running) return;
      this.cameraClock = true;
      this.cameraFrames += 1;
      this.sampleRates(performance.now(), null);
      withFrames.requestVideoFrameCallback?.(tick);
    };
    withFrames.requestVideoFrameCallback(tick);
  }

  private sampleRates(now: number, inferenceMs: number | null) {
    if (this.rateWindowStart === 0) this.rateWindowStart = now;
    if (inferenceMs !== null) {
      this.poseFrames += 1;
      this.inferenceSamples += 1;
      this.inferenceTotal += inferenceMs;
      this.rates = { ...this.rates, inferenceMs };
    }
    const elapsed = now - this.rateWindowStart;
    if (elapsed < 1000) return;
    const seconds = elapsed / 1000;
    this.rates = {
      cameraFps: this.cameraClock ? this.cameraFrames / seconds : null,
      poseFps: this.poseFrames / seconds,
      inferenceMs: this.inferenceSamples > 0 ? this.inferenceTotal / this.inferenceSamples : this.rates.inferenceMs,
    };
    this.cameraFrames = 0;
    this.poseFrames = 0;
    this.inferenceTotal = 0;
    this.inferenceSamples = 0;
    this.rateWindowStart = now;
  }

  private draw(landmarks: Array<{ x: number; y: number }> | undefined) {
    const canvas = this.canvas;
    const video = this.video;
    if (!canvas || !video) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const width = video.videoWidth || 480;
    const height = video.videoHeight || 360;
    const size = `${width}x${height}`;
    if (this.canvasSize !== size) {
      canvas.width = width;
      canvas.height = height;
      this.canvasSize = size;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks) return;
    context.strokeStyle = "#3df0ff";
    context.fillStyle = "#BEFF39";
    context.lineWidth = 3;
    const pairs = [
      [11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28],
    ];
    context.beginPath();
    for (const [from, to] of pairs) {
      const a = landmarks[from];
      const b = landmarks[to];
      if (!a || !b) continue;
      context.moveTo(a.x * canvas.width, a.y * canvas.height);
      context.lineTo(b.x * canvas.width, b.y * canvas.height);
    }
    context.stroke();
    for (const index of [0, 11, 12, 15, 16, 23, 24, 27, 28]) {
      const point = landmarks[index];
      if (!point) continue;
      context.beginPath();
      context.arc(point.x * canvas.width, point.y * canvas.height, 5, 0, Math.PI * 2);
      context.fill();
    }
  }

}

export function gestureLabel(movement: string) {
  if (movement === "lean_left") return "MOVE LEFT";
  if (movement === "lean_right") return "MOVE RIGHT";
  if (movement === "jump") return "JUMP";
  if (movement === "squat") return "DUCK";
  return movement.replaceAll("_", " ").toUpperCase();
}

function diagnosticsFrom(
  update: DetectorUpdate,
  mirrored: boolean,
  poseAtMs: number,
  landmarks: Array<{ x: number; y: number; visibility?: number }> | undefined,
): PoseDiagnostics {
  const signals = update.signals;
  const stamp = update.state.lastTimestamp ?? poseAtMs;
  return {
    phase: update.state.phase,
    confidence: signals?.confidence ?? 0,
    leftElbow: signals?.leftArm.elbowAngle ?? 0,
    rightElbow: signals?.rightArm.elbowAngle ?? 0,
    leftLateral: signals?.leftArm.lateral ?? 0,
    rightLateral: signals?.rightArm.lateral ?? 0,
    hipDrop: signals?.hipDrop ?? 0,
    kneeAngle: signals?.kneeAngle ?? 0,
    riseSpeed: signals?.riseSpeed ?? 0,
    ankleRise: signals?.ankleRise ?? 0,
    reject: update.state.lastReject?.reason ?? null,
    leftPhase: update.state.left.phase,
    rightPhase: update.state.right.phase,
    squatPhase: update.state.squat.phase,
    jumpPhase: update.state.jump.phase,
    lastGesture: update.state.lastGesture?.movementType ?? null,
    mirrored,
    orientation: bodyOrientation(landmarks),
    bodyVisibility: signals?.bodyVisibility ?? 0,
    leftElevation: signals?.leftArm.elevation ?? 0,
    rightElevation: signals?.rightArm.elevation ?? 0,
    leftReach: signals?.leftArm.reach ?? 0,
    rightReach: signals?.rightArm.reach ?? 0,
    leftHeight: signals?.leftArm.height ?? 0,
    rightHeight: signals?.rightArm.height ?? 0,
    leftOutward: (signals?.leftArm.lateral ?? 0) - (update.state.neutral?.leftWristLateral ?? 0),
    rightOutward: (signals?.rightArm.lateral ?? 0) - (update.state.neutral?.rightWristLateral ?? 0),
    hipVelocity: signals?.hipVelocity ?? 0,
    ankleVelocity: signals?.ankleVelocity ?? 0,
    ankleFlex: signals?.ankleFlex ?? 0,
    kneeFlex: signals?.kneeFlex ?? 0,
    jumpMotion: update.state.jumpMotion,
    cooldownMs: Math.max(0, update.state.recoverUntil - stamp),
    poseAtMs,
    gestureAtMs: update.state.lastGesture?.at ?? null,
    eventId: update.state.lastGesture?.eventId ?? null,
    joints: formatBodyJoints(landmarks),
  };
}

function bodyOrientation(landmarks: Array<{ x: number; y: number }> | undefined) {
  const left = landmarks?.[11];
  const right = landmarks?.[12];
  if (!left || !right) return "unknown";
  const width = Math.max(0.04, Math.abs(right.x - left.x));
  return Math.abs(left.y - right.y) / width > 0.35 ? "tilted" : "level";
}

function formatBodyJoints(landmarks: Array<{ x: number; y: number }> | undefined) {
  if (!landmarks?.length) return null;
  const named = [
    [11, "L shoulder"],
    [12, "R shoulder"],
    [13, "L elbow"],
    [14, "R elbow"],
    [15, "L wrist"],
    [16, "R wrist"],
    [23, "L hip"],
    [24, "R hip"],
    [25, "L knee"],
    [26, "R knee"],
    [27, "L ankle"],
    [28, "R ankle"],
  ] as const;
  const parts = named.flatMap(([index, label]) => {
    const point = landmarks[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
    return [`${label} ${point.x.toFixed(2)},${point.y.toFixed(2)}`];
  });
  return parts.length > 0 ? parts.join(" · ") : null;
}

export async function openCamera(video: HTMLVideoElement) {
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  const stream = await requestFrontCamera(video);
  if (video.srcObject !== stream) video.srcObject = stream;
  if (video.paused) await video.play();
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    video.width = video.videoWidth;
    video.height = video.videoHeight;
  }
  return stream;
}

async function requestFrontCamera(video: HTMLVideoElement) {
  let best: MediaStream | null = null;
  let bestScore = -1;
  let lastError: unknown = null;
  for (const constraints of frontCameraAttempts()) {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: constraints });
    } catch (error) {
      lastError = error;
      if (!isOverconstrained(error) && !best) throw error;
      continue;
    }
    const score = await frameScore(stream, video);
    if (!best || score > bestScore) {
      if (best && best !== stream) best.getTracks().forEach((track) => track.stop());
      best = stream;
      bestScore = score;
    } else {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (bestScore >= 1) break;
  }
  if (best) return best;
  if (lastError && !isOverconstrained(lastError)) throw lastError;
  return navigator.mediaDevices.getUserMedia({ audio: false, video: frontCameraFallback() });
}

/** The preview uses the video element's frame, which can differ from the track's sensor size. */
async function frameScore(stream: MediaStream, video: HTMLVideoElement) {
  video.srcObject = stream;
  try {
    await video.play();
    if (video.videoWidth === 0) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        video.addEventListener("loadedmetadata", done, { once: true });
        window.setTimeout(done, 800);
      });
    }
  } catch {
    const settings = stream.getVideoTracks()[0]?.getSettings();
    return portraitScore(settings?.width ?? 0, settings?.height ?? 0);
  }
  const played = portraitScore(video.videoWidth, video.videoHeight);
  if (played > 0) return played;
  const settings = stream.getVideoTracks()[0]?.getSettings();
  return portraitScore(settings?.width ?? 0, settings?.height ?? 0);
}

function isOverconstrained(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  return name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError";
}

function formatLandmarkSample(landmarks: Array<{ x: number; y: number }> | undefined) {
  if (!landmarks?.length) return null;
  const named = [
    [0, "nose"],
    [15, "left wrist"],
    [16, "right wrist"],
    [27, "left ankle"],
    [28, "right ankle"],
  ] as const;
  const parts = named.flatMap(([index, label]) => {
    const point = landmarks[index];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
    return [`${label} ${point.x.toFixed(2)}, ${point.y.toFixed(2)}`];
  });
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function releaseCamera(stream: MediaStream | null, video: HTMLVideoElement | null) {
  stream?.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
  if (video) video.srcObject = null;
}

export function cameraErrorMessage(error: unknown) {
  const secure = typeof window === "undefined" || window.isSecureContext;
  return classifyCameraError(error, secure).message;
}
