import { wristLaterals } from "./movement-classifier";
import { angleDegrees, distance, midpoint, point } from "./geometry";
import { DEFAULT_THRESHOLDS, POSE, type Landmark, type MovementThresholds, type NeutralPose, type PoseFrame } from "./movement-types";

export interface FramingAssessment {
  ready: boolean;
  confidence: number;
  guidance: string;
  missing: string[];
}

const FRAMING_JOINTS: Array<[number, string]> = [
  [POSE.nose, "head"],
  [POSE.leftShoulder, "shoulders"],
  [POSE.rightShoulder, "shoulders"],
  [POSE.leftHip, "hips"],
  [POSE.rightHip, "hips"],
  [POSE.leftKnee, "knees"],
  [POSE.rightKnee, "knees"],
  [POSE.leftAnkle, "ankles"],
  [POSE.rightAnkle, "ankles"],
];

function inImage(landmark: Landmark | null | undefined) {
  if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return false;
  return landmark.x >= 0 && landmark.x <= 1 && landmark.y >= 0 && landmark.y <= 1;
}

/**
 * Ready when the head, shoulders, and hips are visible inside the image.
 * Knees and ankles under the visibility floor are covered. They do not block calibration.
 * A joint that is visible but outside the image still blocks. There is no standing box.
 */
export function assessFraming(landmarks: Array<Landmark | null | undefined>, minVisibility: number): FramingAssessment {
  const missing: string[] = [];
  const outside: string[] = [];
  let visibilityTotal = 0;
  let counted = 0;
  for (const [index, label] of FRAMING_JOINTS) {
    const landmark = landmarks[index];
    const visibility = landmark?.visibility ?? 0;
    visibilityTotal += visibility;
    counted += 1;
    if (!landmark || visibility < minVisibility) {
      missing.push(label);
      continue;
    }
    if (!inImage(landmark)) outside.push(label);
  }
  const uniqueMissing = [...new Set(missing)];
  const uniqueOutside = [...new Set(outside)];
  const confidence = counted > 0 ? visibilityTotal / counted : 0;
  const covered = uniqueMissing.filter((label) => label === "knees" || label === "ankles");
  const blocking = [...new Set([...uniqueMissing.filter((label) => label !== "knees" && label !== "ankles"), ...uniqueOutside])];
  if (blocking.length > 0) {
    const feet = blocking.includes("ankles");
    const head = blocking.includes("head") || blocking.includes("shoulders");
    const guidance = feet
      ? "Step back until both feet are visible."
      : head
        ? "Step back so your head and shoulders fit in frame."
        : `Move so your ${blocking.join(", ")} stay in frame.`;
    return { ready: false, confidence, missing: blocking, guidance };
  }
  return {
    ready: true,
    confidence,
    missing: [],
    guidance: covered.length > 0 ? "Upper body and hips are visible. Hold still to calibrate." : "Hold still to calibrate your neutral stance.",
  };
}

export function neutralFromLandmarks(landmarks: Array<Landmark | null | undefined>): NeutralPose | null {
  const floor = DEFAULT_THRESHOLDS.minVisibility;
  const seen = (index: number) => {
    const landmark = landmarks[index];
    if (!landmark || (landmark.visibility ?? 0) < floor) return null;
    return point(landmarks, index);
  };
  const leftShoulder = seen(POSE.leftShoulder);
  const rightShoulder = seen(POSE.rightShoulder);
  const leftHip = seen(POSE.leftHip);
  const rightHip = seen(POSE.rightHip);
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return null;
  const leftKnee = seen(POSE.leftKnee);
  const rightKnee = seen(POSE.rightKnee);
  const leftAnkle = seen(POSE.leftAnkle);
  const rightAnkle = seen(POSE.rightAnkle);
  const shoulder = midpoint(leftShoulder, rightShoulder);
  const hip = midpoint(leftHip, rightHip);
  const torso = Math.max(0.05, Math.hypot(hip.x - shoulder.x, hip.y - shoulder.y));
  const shoulderHip = (shoulder.x - hip.x) / torso;
  const shoulderWidth = Math.max(0.04, Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y));
  const wrists = wristLaterals(landmarks, shoulderWidth);
  const legsMeasured = Boolean(leftKnee && rightKnee && leftAnkle && rightAnkle);
  const ankle = legsMeasured && leftAnkle && rightAnkle ? midpoint(leftAnkle, rightAnkle) : null;
  const kneeAngle =
    legsMeasured && leftKnee && rightKnee && leftAnkle && rightAnkle
      ? (angleDegrees(leftHip, leftKnee, leftAnkle) + angleDegrees(rightHip, rightKnee, rightAnkle)) / 2
      : 180;
  return {
    centerX: (shoulder.x + hip.x) / 2,
    hipY: hip.y,
    shoulderY: shoulder.y,
    torso,
    shoulderWidth,
    ankleY: ankle ? ankle.y : hip.y + torso,
    kneeAngle,
    thighLength: legsMeasured && leftKnee && rightKnee ? (distance(leftHip, leftKnee) + distance(rightHip, rightKnee)) / 2 : 0,
    shinLength: legsMeasured && leftKnee && rightKnee && leftAnkle && rightAnkle ? (distance(leftKnee, leftAnkle) + distance(rightKnee, rightAnkle)) / 2 : 0,
    leftWristLateral: wrists.left,
    rightWristLateral: wrists.right,
    shoulderHip,
    legsMeasured,
  };
}

/** Slow blend toward a quiet stance. Callers freeze this during a jump, squat, or arm raise. */
export function driftNeutral(neutral: NeutralPose, sample: NeutralPose, alpha: number): NeutralPose {
  const blend = (from: number, to: number) => from + (to - from) * alpha;
  return {
    centerX: blend(neutral.centerX, sample.centerX),
    hipY: blend(neutral.hipY, sample.hipY),
    shoulderY: blend(neutral.shoulderY, sample.shoulderY),
    torso: blend(neutral.torso, sample.torso),
    shoulderWidth: blend(neutral.shoulderWidth, sample.shoulderWidth),
    ankleY: sample.legsMeasured === false ? neutral.ankleY : blend(neutral.ankleY, sample.ankleY),
    kneeAngle: sample.legsMeasured === false ? neutral.kneeAngle : blend(neutral.kneeAngle, sample.kneeAngle),
    thighLength: sample.legsMeasured === false ? neutral.thighLength : blend(neutral.thighLength, sample.thighLength),
    shinLength: sample.legsMeasured === false ? neutral.shinLength : blend(neutral.shinLength, sample.shinLength),
    leftWristLateral: blend(neutral.leftWristLateral, sample.leftWristLateral),
    rightWristLateral: blend(neutral.rightWristLateral, sample.rightWristLateral),
    shoulderHip: blend(neutral.shoulderHip ?? 0, sample.shoulderHip ?? 0),
  };
}

export function calibrateNeutral(
  frames: PoseFrame[],
  minVisibility: number,
): { neutral: NeutralPose | null; guidance: string; stable: boolean } {
  if (frames.length < 6) {
    return { neutral: null, stable: false, guidance: "Hold still for a moment." };
  }
  const poses = frames.map((frame) => frame.landmarks);
  const assessments = poses.map((landmarks) => assessFraming(landmarks, minVisibility));
  if (assessments.some((item) => !item.ready)) {
    return { neutral: null, stable: false, guidance: assessments.find((item) => !item.ready)?.guidance ?? "Adjust your position." };
  }
  const neutrals = poses.map((landmarks) => neutralFromLandmarks(landmarks)).filter((item): item is NeutralPose => Boolean(item));
  if (neutrals.length < 6) return { neutral: null, stable: false, guidance: "Keep your full body visible." };
  const hipSpread = spread(neutrals.map((item) => item.hipY));
  const centerSpread = spread(neutrals.map((item) => item.centerX));
  if (hipSpread > 0.03 || centerSpread > 0.03) {
    return { neutral: null, stable: false, guidance: "Hold still — too much movement to calibrate." };
  }
  const withLegs = neutrals.filter((item) => item.legsMeasured !== false);
  const legSource = withLegs.length > 0 ? withLegs : neutrals;
  return {
    stable: true,
    guidance: "Calibrated to your stance. You can play when the TV starts.",
    neutral: {
      centerX: average(neutrals.map((item) => item.centerX)),
      hipY: average(neutrals.map((item) => item.hipY)),
      shoulderY: average(neutrals.map((item) => item.shoulderY)),
      torso: average(neutrals.map((item) => item.torso)),
      shoulderWidth: average(neutrals.map((item) => item.shoulderWidth)),
      ankleY: average(legSource.map((item) => item.ankleY)),
      kneeAngle: average(legSource.map((item) => item.kneeAngle)),
      thighLength: average(legSource.map((item) => item.thighLength)),
      shinLength: average(legSource.map((item) => item.shinLength)),
      leftWristLateral: average(neutrals.map((item) => item.leftWristLateral)),
      rightWristLateral: average(neutrals.map((item) => item.rightWristLateral)),
      shoulderHip: average(neutrals.map((item) => item.shoulderHip ?? 0)),
      legsMeasured: withLegs.length > 0,
    },
  };
}

/**
 * Moves the squat knee gate to this player's standing angle, inside a fixed safe range.
 * A still calibration cannot see how high they raise an arm, so arm gates stay put.
 */
export function adaptThresholds(neutral: NeutralPose, _current: MovementThresholds): Partial<MovementThresholds> {
  const squatKneeEnter = clamp(neutral.kneeAngle - 18, 142, 156);
  const squatKneeExit = clamp(squatKneeEnter + 8, squatKneeEnter + 6, 170);
  return { squatKneeEnter, squatKneeExit };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Session stance from several standing samples.
 * The median ignores a bad first frame. Fewer than five samples is not a baseline.
 */
export function medianStandingBaseline(samples: NeutralPose[]): NeutralPose | null {
  if (samples.length < 5) return null;
  const withLegs = samples.filter((item) => item.legsMeasured !== false);
  const legs = withLegs.length > 0 ? withLegs : samples;
  return {
    centerX: median(samples.map((item) => item.centerX)),
    hipY: median(samples.map((item) => item.hipY)),
    shoulderY: median(samples.map((item) => item.shoulderY)),
    torso: median(samples.map((item) => item.torso)),
    shoulderWidth: median(samples.map((item) => item.shoulderWidth)),
    ankleY: median(legs.map((item) => item.ankleY)),
    kneeAngle: median(legs.map((item) => item.kneeAngle)),
    thighLength: median(legs.map((item) => item.thighLength)),
    shinLength: median(legs.map((item) => item.shinLength)),
    leftWristLateral: median(samples.map((item) => item.leftWristLateral)),
    rightWristLateral: median(samples.map((item) => item.rightWristLateral)),
    shoulderHip: median(samples.map((item) => item.shoulderHip ?? 0)),
    legsMeasured: withLegs.length > 0,
  };
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}
