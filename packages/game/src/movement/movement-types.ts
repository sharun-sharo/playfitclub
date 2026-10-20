import type { MovementType } from "@fitplay/shared";

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** One camera frame. Coordinates are normalized, origin at the top-left, y downward. */
export interface PoseFrame {
  timestampMs: number;
  landmarks: Array<Landmark | null | undefined>;
}

export interface MovementDraft {
  movementType: MovementType;
  confidence: number;
  clientTimestamp: number;
  sequenceNumber: number;
}

export const POSE = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export const REQUIRED_LANDMARKS = [
  POSE.leftShoulder,
  POSE.rightShoulder,
  POSE.leftHip,
  POSE.rightHip,
  POSE.leftKnee,
  POSE.rightKnee,
  POSE.leftAnkle,
  POSE.rightAnkle,
] as const;

export interface MovementThresholds {
  minVisibility: number;
  /** Average joint confidence required before a gesture is emitted. */
  minActionConfidence: number;
  leanEnter: number;
  leanExit: number;
  squatEnterDrop: number;
  squatExitDrop: number;
  squatKneeEnter: number;
  squatKneeExit: number;
  /** Upward hip speed in torso-lengths per second. This is an estimate, not measured height. */
  jumpRise: number;
  jumpAnkleRise: number;
  punchEnter: number;
  punchExit: number;
  holdMs: number;
  cooldownMs: number;
  smoothingAlpha: number;
  mirror: boolean;
}

export const DEFAULT_THRESHOLDS: MovementThresholds = {
  minVisibility: 0.45,
  minActionConfidence: 0.6,
  leanEnter: 0.5,
  leanExit: 0.22,
  squatEnterDrop: 0.28,
  squatExitDrop: 0.12,
  squatKneeEnter: 140,
  squatKneeExit: 155,
  jumpRise: 0.48,
  jumpAnkleRise: 0.02,
  punchEnter: 1.42,
  punchExit: 1.12,
  holdMs: 700,
  cooldownMs: 240,
  smoothingAlpha: 0.78,
  mirror: true,
};

export interface NeutralPose {
  centerX: number;
  hipY: number;
  shoulderY: number;
  torso: number;
  shoulderWidth: number;
  ankleY: number;
  kneeAngle: number;
}

export type BodyPhase = "neutral" | "lean_left" | "lean_right" | "squat" | "air" | "punch";

export interface PoseSignals {
  ok: boolean;
  reason?: "missing" | "low_confidence";
  confidence: number;
  /** Positive means the player leaned to their left relative to the calibrated center. */
  lean: number;
  hipDrop: number;
  kneeAngle: number;
  /** Positive means the hips are rising in the image. Monocular cameras cannot measure true jump height. */
  riseSpeed: number;
  ankleRise: number;
  leftExtension: number;
  rightExtension: number;
  armsOut: number;
}

export interface DetectorState {
  thresholds: MovementThresholds;
  smoother: Array<{ x: number; y: number } | null>;
  neutral: NeutralPose | null;
  phase: BodyPhase;
  lastHipY: number | null;
  lastTimestamp: number | null;
  cooldownUntil: number;
  holdSince: number | null;
  holdLatched: boolean;
  sequence: number;
  riseWindow: number[];
}
