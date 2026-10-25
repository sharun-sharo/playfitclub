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
  /** Stable id for this confirmed gesture. Retries of the same gesture keep this id. */
  eventId: string;
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
  /** Lateral wrist distance, in shoulder-widths, before an arm-out gesture can start. */
  armOutEnter: number;
  /** The arm must drop below this before that side can send another lane command. */
  armOutExit: number;
  /** How far the wrist may sit from shoulder height, in torso lengths. Kept for stored tuning. Elevation is the raise gate. */
  armHeightEnter: number;
  armHeightExit: number;
  /** Angle from a hanging arm. 0 is down, 90 is shoulder height, overhead is toward 180. */
  armElevationEnter: number;
  armElevationExit: number;
  /** Planted hip drop, in torso lengths, that arms a countermovement jump. */
  jumpPrepDrop: number;
  /** Knee flexion from the session baseline, in degrees, required before that dip can become a jump. */
  jumpPrepKnee: number;
  /** How long a dip must already have lasted. The rise frame itself does not add another wait. */
  jumpPrepMs: number;
  /** Shin angle from vertical, in degrees, required for a planted squat. */
  squatAnkleFlex: number;
  /** Elbow angle in degrees. Kept for stored tuning. Lane changes do not require this straight-arm gate. */
  elbowEnter: number;
  elbowExit: number;
  /**
   * Extra outward wrist travel from the calibrated hang, in shoulder widths.
   * A waist-to-chest raise uses this. It does not require the wrist above the shoulder.
   */
  halfwayOutEnter: number;
  halfwayOutExit: number;
  /** Wrist below the shoulder, in torso lengths. The low number is chest. The high number is the waist. */
  halfwayHeightMin: number;
  halfwayHeightMax: number;
  /** Bent-elbow floor for a chest-height hand. A folded arm against the ribs stays below it. */
  halfwayElbowMin: number;
  /** Degrees up from hanging. About 90 is a sideways point. This band is not overhead. */
  sidewaysElevationMin: number;
  sidewaysElevationMax: number;
  /** Shoulder-to-wrist distance, in shoulder widths, for an arm pointed sideways. */
  sidewaysReachEnter: number;
  sidewaysReachExit: number;
  /** Extended sideways, including a soft elbow. Not a locked straight arm. */
  sidewaysElbowEnter: number;
  sidewaysElbowExit: number;
  /** Blend applied to a quiet stance each frame. Jump, squat, and an arm raise freeze it. */
  neutralDrift: number;
  /**
   * Same-frame guard for a lane change. The frame that first crosses the line does not emit.
   * The next frame that is still past the line does. One noisy frame does not.
   */
  armHoldMs: number;
  /**
   * How long the hips must stay down before one duck is sent.
   * Two camera frames can be a bob. The third frame at 30fps is the confirm.
   */
  squatHoldMs: number;
  /** Quiet stance required after a squat or landing before another gesture can arm. */
  recoverMs: number;
  cooldownMs: number;
  smoothingAlpha: number;
  mirror: boolean;
}

export const DEFAULT_THRESHOLDS: MovementThresholds = {
  minVisibility: 0.45,
  minActionConfidence: 0.6,
  leanEnter: 0.5,
  leanExit: 0.22,
  squatEnterDrop: 0.16,
  squatExitDrop: 0.07,
  squatKneeEnter: 155,
  squatKneeExit: 166,
  /** Upward hip speed that starts a hop. This is the gate itself, in torso-lengths per second. */
  jumpRise: 0.32,
  jumpAnkleRise: 0.04,
  punchEnter: 1.42,
  punchExit: 1.12,
  holdMs: 700,
  armOutEnter: 0.68,
  armOutExit: 0.32,
  armHeightEnter: 0.5,
  armHeightExit: 0.72,
  armElevationEnter: 50,
  armElevationExit: 28,
  jumpPrepDrop: 0.1,
  jumpPrepKnee: 12,
  jumpPrepMs: 50,
  squatAnkleFlex: 8,
  elbowEnter: 122,
  elbowExit: 100,
  halfwayOutEnter: 0.42,
  halfwayOutExit: 0.3,
  halfwayHeightMin: 0.28,
  halfwayHeightMax: 0.95,
  halfwayElbowMin: 70,
  sidewaysElevationMin: 62,
  sidewaysElevationMax: 120,
  sidewaysReachEnter: 0.9,
  sidewaysReachExit: 0.72,
  sidewaysElbowEnter: 100,
  sidewaysElbowExit: 85,
  neutralDrift: 0.02,
  armHoldMs: 1,
  /** Third 30fps frame. A one-frame hold would duck on a two-sample bob. */
  squatHoldMs: 66,
  recoverMs: 180,
  cooldownMs: 240,
  /** One frame takes 92% of a step. Two frames take about 99%. A one-frame spike still needs the next frame. */
  smoothingAlpha: 0.92,
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
  /** Image length of the thigh while standing. A front squat shortens this even when depth is tiny. */
  thighLength: number;
  /** Image length of the shin while standing. */
  shinLength: number;
  /**
   * False when the standing sample had no knees or ankles above the visibility floor.
   * Drift must not replace a measured leg with that empty sample.
   */
  legsMeasured?: boolean;
  /** Hanging wrist, outward from its shoulder, in shoulder widths. The raise is measured from here. */
  leftWristLateral: number;
  rightWristLateral: number;
}

export type BodyPhase =
  | "NEUTRAL"
  | "LEFT_ARM_ACTIVE"
  | "RIGHT_ARM_ACTIVE"
  | "SQUATTING"
  | "JUMPING"
  | "RECOVERING";

/** One physical jump. A landing frame is not a second jump. */
export type JumpMotion = "grounded" | "preparing" | "takeoff" | "airborne" | "landing" | "recovery";

export type GesturePhase = "NEUTRAL" | "CANDIDATE" | "CONFIRMED" | "SENT" | "WAIT_RESET";

/** One arm raise. Hold stays in WAIT_FOR_RELEASE until the arm lowers. */
export type ArmPhase = "NEUTRAL" | "ARM_RISING" | "TRIGGERED" | "WAIT_FOR_RELEASE";

export type TrackPhase = GesturePhase | ArmPhase;

export interface GestureTrack {
  phase: TrackPhase;
  since: number;
  eventId: string | null;
  suppress: boolean;
}

export type PoseRejectReason = "both_arms" | "low_confidence" | "tracking_lost" | "forward_bend";

export interface PoseReject {
  reason: PoseRejectReason;
  at: number;
}

/** One arm, measured from MediaPipe's anatomical shoulder, elbow, and wrist. */
export interface ArmPose {
  /** Distance outward from the shoulder, in shoulder-widths. Positive is away from the other shoulder. */
  lateral: number;
  /** 0 is shoulder height. Positive means the wrist is below the shoulder. */
  height: number;
  /** Shoulder-to-wrist distance, in shoulder-widths. Hanging and overhead are both long. */
  reach: number;
  /** Degrees up from hanging. Scale-invariant. */
  elevation: number;
  elbowAngle: number;
  visible: boolean;
}

export interface PoseSignals {
  ok: boolean;
  reason?: "missing" | "low_confidence";
  confidence: number;
  /** Positive means the torso center moved to the player's left. Lane commands do not use this. */
  lean: number;
  hipDrop: number;
  kneeAngle: number;
  /** Peak hip rise over a short window. This is a hip-rise estimate, not proof both feet left the ground. */
  riseSpeed: number;
  /** Hip rise on this frame only, in torso-lengths per second. */
  hipVelocity: number;
  /** Ankle rise on this frame only, in torso-lengths per second. Positive means the ankles moved up. */
  ankleVelocity: number;
  ankleRise: number;
  /** Degrees the knees have bent past the session baseline. */
  kneeFlex: number;
  /** Shin angle from vertical. A squat pushes the knees forward over planted feet. */
  ankleFlex: number;
  /** Share of required joints at or above the visibility floor. */
  bodyVisibility: number;
  leftExtension: number;
  rightExtension: number;
  armsOut: number;
  leftArm: ArmPose;
  rightArm: ArmPose;
  /** Knees and ankles are visible enough to judge a squat or a hop from the legs. */
  legsReady: boolean;
  /** Shoulders dropped toward the hips while the knees stayed nearly straight, or the torso folded with little hip drop. */
  forwardBend: boolean;
  /** Image torso is clearly shorter than the standing calibration. A small bow stays false. */
  torsoFold: boolean;
  /** Shoulder image-y speed in torso-lengths per second. Up is positive. */
  shoulderVelocity: number;
}

export interface DetectorState {
  thresholds: MovementThresholds;
  smoother: Array<{ x: number; y: number; z?: number } | null>;
  neutral: NeutralPose | null;
  phase: BodyPhase;
  lastHipY: number | null;
  lastShoulderY: number | null;
  lastAnkleY: number | null;
  lastTimestamp: number | null;
  sequence: number;
  riseWindow: number[];
  recoverUntil: number;
  lastReject: PoseReject | null;
  rejectLatched: boolean;
  left: GestureTrack;
  right: GestureTrack;
  squat: GestureTrack;
  jump: GestureTrack;
  jumpMotion: JumpMotion;
  /** Timestamp of the current planted dip. Null when the body is not preparing. */
  prepSince: number | null;
  lostSince: number | null;
  lastGesture: { movementType: MovementDraft["movementType"]; eventId: string; at: number } | null;
  /**
   * After tracking returns, ignore the pose already in frame until it is quiet.
   * The next real movement after that can be emitted.
   */
  awaitRelease: boolean;
}
