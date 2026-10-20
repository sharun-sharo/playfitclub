import {
  assessFraming,
  calibrateNeutral,
  createDetector,
  pushPose,
  setNeutral,
  type DetectorState,
  type MovementDraft,
  type PoseFrame,
} from "@fitplay/game";
import { CAMERA_LOST_MESSAGE, classifyCameraError } from "@/lib/vision/camera-status";

type Facing = "user" | "environment";

export interface PoseUiState {
  guidance: string;
  confidence: number;
  framingReady: boolean;
  calibrated: boolean;
  movement: string | null;
  actionsEnabled: boolean;
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
  private landmarker: { detectForVideo: (video: HTMLVideoElement, timestamp: number) => { landmarks?: Array<Array<{ x: number; y: number; z?: number; visibility?: number }>> }; close: () => void } | null = null;
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

  async load() {
    if (this.landmarker) return;
    const vision = await import("@mediapipe/tasks-vision");
    const files = await vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const options = {
      baseOptions: { modelAssetPath: "/mediapipe/pose_landmarker_lite.task", delegate: "GPU" as const },
      runningMode: "VIDEO" as const,
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
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    this.raf = requestAnimationFrame(loop);
  }

  setMode(mode: "idle" | "calibrate" | "play") {
    this.mode = mode;
    if (mode === "idle") this.stopLoop();
  }

  stop() {
    this.stopLoop();
    this.landmarker?.close();
    this.landmarker = null;
    this.recent = [];
    this.actionsOpen = false;
    this.detector = createDetector({ mirror: this.facing === "user" });
  }

  suspend(message: string) {
    if (this.lost) return;
    this.lost = true;
    this.actionsOpen = false;
    this.stopLoop();
    this.handlers?.onUi({
      guidance: message,
      confidence: 0,
      framingReady: false,
      calibrated: Boolean(this.detector.neutral),
      movement: null,
      actionsEnabled: false,
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
    let result: { landmarks?: Array<Array<{ x: number; y: number; z?: number; visibility?: number }>> };
    try {
      result = landmarker.detectForVideo(video, now);
    } catch {
      this.suspend(CAMERA_LOST_MESSAGE);
      return;
    }
    const raw = result.landmarks?.[0];
    if (now - this.lastDraw > 50) {
      this.lastDraw = now;
      this.draw(raw);
    }
    if (!raw) {
      this.emitUi({ guidance: "No body detected. Step fully into frame. Body controls are paused.", confidence: 0, framingReady: false, calibrated: Boolean(this.detector.neutral), movement: null, actionsEnabled: false }, now);
      return;
    }
    const frame: PoseFrame = {
      timestampMs: now,
      landmarks: raw.map((point) => ({ x: point.x, y: point.y, z: point.z, visibility: point.visibility })),
    };
    if (this.mode === "calibrate") {
      this.recent.push(frame);
      this.recent = this.recent.slice(-12);
      const calibration = calibrateNeutral(this.recent, this.detector.thresholds.minVisibility);
      if (calibration.neutral) this.detector = setNeutral(this.detector, calibration.neutral);
      const framing = assessFraming(frame.landmarks, this.detector.thresholds.minVisibility);
      this.emitUi({
        guidance: calibration.guidance,
        confidence: framing.confidence,
        framingReady: framing.ready,
        calibrated: Boolean(calibration.neutral),
        movement: null,
        actionsEnabled: false,
      }, now);
      return;
    }
    const update = pushPose(this.detector, frame);
    this.detector = update.state;
    const movement = update.events[0]?.movementType ?? null;
    const confident = Boolean(update.signals?.ok && (update.signals.confidence ?? 0) >= this.detector.thresholds.minActionConfidence);
    if (movement) {
      this.lastAction = movement;
      this.lastActionAt = now;
    }
    if (this.mode === "play" && this.actionsOpen) {
      for (const event of update.events) this.handlers?.onMovement(event);
    }
    this.emitUi({
      guidance: update.guidance,
      confidence: update.signals?.confidence ?? 0,
      framingReady: update.framingReady,
      calibrated: Boolean(this.detector.neutral),
      movement,
      actionsEnabled: this.actionsOpen && confident,
    }, now);
  }

  private emitUi(state: PoseUiState, now: number) {
    if (now - this.lastUi < 180 && !state.movement) return;
    this.lastUi = now;
    this.handlers?.onUi(state);
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
    if (this.mode === "calibrate") this.drawGuide(context, canvas.width, canvas.height);
    if (this.lastAction && performance.now() - this.lastActionAt < 1200) {
      context.fillStyle = "#f4f1ea";
      context.font = "700 42px sans-serif";
      context.fillText(gestureLabel(this.lastAction), 24, 56);
    }
    if (!landmarks) return;
    context.strokeStyle = "#3df0ff";
    context.fillStyle = "#9b6bff";
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

  private drawGuide(context: CanvasRenderingContext2D, width: number, height: number) {
    context.save();
    context.strokeStyle = "rgba(244, 241, 234, 0.85)";
    context.lineWidth = 3;
    context.setLineDash([10, 8]);
    context.beginPath();
    context.ellipse(width * 0.5, height * 0.16, width * 0.07, height * 0.05, 0, 0, Math.PI * 2);
    context.moveTo(width * 0.38, height * 0.28);
    context.lineTo(width * 0.62, height * 0.28);
    context.moveTo(width * 0.5, height * 0.28);
    context.lineTo(width * 0.5, height * 0.52);
    context.moveTo(width * 0.4, height * 0.52);
    context.lineTo(width * 0.6, height * 0.52);
    context.moveTo(width * 0.44, height * 0.52);
    context.lineTo(width * 0.42, height * 0.86);
    context.moveTo(width * 0.56, height * 0.52);
    context.lineTo(width * 0.58, height * 0.86);
    context.stroke();
    context.restore();
  }
}

export function gestureLabel(movement: string) {
  if (movement === "lean_left") return "LEFT";
  if (movement === "lean_right") return "RIGHT";
  if (movement === "jump") return "JUMP";
  if (movement === "squat") return "DUCK";
  return movement.replaceAll("_", " ").toUpperCase();
}

export async function openCamera(video: HTMLVideoElement, facing: Facing) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: facing,
      width: { ideal: 480, max: 640 },
      height: { ideal: 360, max: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
  });
  video.srcObject = stream;
  video.muted = true;
  await video.play();
  return stream;
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
