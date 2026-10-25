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
  /** Kept for stored tuning. Lane changes use torsoLeanEnter, not this. */
  leanEnter: number;
  /** Kept for stored tuning. The neutral reset for a body lean is torsoLeanNeutral. */
  leanExit: number;
  /**
   * How far the shoulder center must pass the hip center, in torso lengths, before one lane change.
   * Measured from this player's standing calibration, after the selfie mirror.
   * Raising it means the player must lean farther. Lower it if a clear lean is ignored.
   * Running in place should stay under this line.
   */
  torsoLeanEnter: number;
  /**
   * How close to upright the shoulders must return, in torso lengths, before another lean can count.
   * Raising this band lets a small leftover lean count as upright, so the next lean can arm sooner.
   * Lowering it means the player must stand straighter. A held lean stays outside this band and does not repeat.
   */
  torsoLeanNeutral: number;
  /**
   * The first sample past the lean line does not send a lane change. The next presented
   * camera frame that is still past it does. The value is real milliseconds, not a frame count.
   * At 30fps that next frame is about 33ms. At 15fps it is about 66ms. Both are under 70ms
   * after the lean is already past the line. Zero would lane-change on a one-sample wobble.
   */
  torsoLeanHoldMs: number;
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
  /** How long a dip must already have lasted. A 1-frame twitch jumps if this is 0. The rise frame does not add another wait once the dip is real. */
  jumpPrepMs: number;
  /**
   * How long an ambiguous dip is watched before it can become a squat.
   * This is only for a short knee bend that could still be a jump.
   * A rise that clears jumpRise emits a jump on that frame and does not wait out the rest.
   * A posture that is still down when the window ends emits one squat.
   * Keep this inside 120–200ms. Raise it if a slow pre-jump bend still ducks.
   * Lower it if a short squat is missed. A settled squat the current tests already
   * accept does not have to wait when the dip is deeper than jumpPrepMaxDrop,
   * or when the player has already stood back up after two still frames.
   */
  dipClassifyMs: number;
  /**
   * Deepest hip drop, in torso lengths, that can still be jump preparation.
   * From squatEnterDrop up to this value, the dip waits dipClassifyMs.
   * At or above this value, two settled frames emit a squat without that wait.
   * 0.32 keeps a 0.30 torso pre-jump crouch from ducking, and keeps a 0.40 torso squat immediate.
   */
  jumpPrepMaxDrop: number;
  /**
   * Degrees the knee must open from the most bent sample of this dip.
   * Used only when the knees actually compressed and the legs are visible.
   * Straight knees, and hidden knees, do not have to pass it.
   */
  kneeExtendDeg: number;
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
   * Same-frame guard. The frame that first crosses the line does not emit.
   * The next frame that is still past the line does. One noisy frame does not.
   */
  armHoldMs: number;
  /**
   * Same-frame guard for a squat. The first down frame does not emit.
   * The next frame that is still down does. A one-frame bob does not.
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
  torsoLeanEnter: 0.16,
  torsoLeanNeutral: 0.07,
  /**
   * Same-sample guard, in real milliseconds. Zero would lane-change on the
   * sample that first crosses the line. 1ms is not "one 30fps frame".
   * The phone feeds one sample per presented camera frame, so the next
   * sample is ~33ms later at 30fps and ~66ms later at 15fps.
   */
  torsoLeanHoldMs: 1,
  /**
   * Hip drop that counts as a squat, in standing-torso lengths.
   * The old gate was 0.16, which only a deep race squat cleared.
   * 0.10 is a normal fitness squat held one or two frames at 30 fps.
   * A slight bow around 0.05, and a one-frame bob, stay under it.
   * Torso length under 90% of the standing calibration is not an extra gate.
   * The knee angle is not an extra gate. Hidden knees still use this hip drop.
   */
  squatEnterDrop: 0.1,
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
  /**
   * Ambiguous dips wait this long. A pre-jump knee bend is inside it.
   * A rise above jumpRise leaves the window early and emits one jump.
   * 160 sits inside the 120–200ms band.
   */
  dipClassifyMs: 160,
  /**
   * Hip drops under this can still be the crouch before a jump.
   * The working squat gate stays squatEnterDrop 0.10. This does not make squats deep-only.
   * A settled drop at or above 0.32 confirms on the next still frame, which is how the
   * 0.40 torso squat fixtures stay inside one or two camera frames.
   */
  jumpPrepMaxDrop: 0.32,
  kneeExtendDeg: 8,
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
  /**
   * Same-sample guard, in real milliseconds. The first down sample does not
   * emit. The next presented camera frame that is still down does.
   * 1ms is not one frame of a 30fps clock.
   */
  squatHoldMs: 1,
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
  /**
   * Standing shoulder-center x minus hip-center x, divided by torso length.
   * A lane lean is the change from this player's own stance, not from the middle of the image.
   */
  shoulderHip: number;
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

/**
 * Jump and squat for one gesture. A dip that might be either stays in
 * POSSIBLE_JUMP_PREPARATION until takeoff, a sustained squat, or a return to neutral.
 * SUSTAINED_SQUAT is separate so standing up does not become a jump.
 */
export type RecognitionPhase =
  | "NEUTRAL"
  | "POSSIBLE_JUMP_PREPARATION"
  | "JUMP_TAKEOFF"
  | "JUMP_AIRBORNE"
  | "LANDING"
  | "SUSTAINED_SQUAT";

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
  /** Positive means the whole torso center moved to the player's left. Lane commands do not use this. */
  lean: number;
  /**
   * Shoulder center relative to the hip center, in torso lengths, minus the standing calibration.
   * Positive is the player's left after the selfie mirror. This is the body-lean lane signal.
   */
  torsoLean: number;
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
  /** Unsmoothed hip image-y. Jump speed uses this so the blend cannot hide a small hop. */
  lastRawHipY: number | null;
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
  /** One upper-body lean. Hold stays in WAIT_RESET until the shoulders return to the neutral band. */
  torso: GestureTrack;
  squat: GestureTrack;
  jump: GestureTrack;
  jumpMotion: JumpMotion;
  /** Jump-versus-squat phase. Dev diagnostics read this. It does not change lane commands. */
  recognition: RecognitionPhase;
  /** Most bent knee angle during the current dip. Null when no dip is open. */
  compressionKnee: number | null;
  /** Consecutive settled frames inside the squat band. A one-frame bob stays at zero. */
  dipStillFrames: number;
  /** Display score for the dev panel. Not a second emit gate. */
  jumpConfidence: number;
  /** Display score for the dev panel. Not a second emit gate. */
  squatConfidence: number;
  /** Timestamp of the current planted dip. Null when the body is not preparing. */
  prepSince: number | null;
  /**
   * True while this dip is still below the prep line.
   * Leaving and entering again is a new dip, so running in place cannot add up to 50ms.
   * Staying down does not restart the clock on every fast downward frame.
   */
  dipOpen: boolean;
  /**
   * The previous frame in the squat band was nearly still.
   * A duck needs two still frames. The bottom of a hop is still moving, so it is not a duck.
   */
  squatCalm: boolean;
  lostSince: number | null;
  lastGesture: { movementType: MovementDraft["movementType"]; eventId: string; at: number } | null;
  /**
   * After tracking returns, ignore the pose already in frame until it is quiet.
   * The next real movement after that can be emitted.
   */
  awaitRelease: boolean;
}
