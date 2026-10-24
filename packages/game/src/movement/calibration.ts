import { wristLaterals } from "./movement-classifier";
import { angleDegrees, distance, midpoint, point } from "./geometry";
import { POSE, type Landmark, type MovementThresholds, type NeutralPose, type PoseFrame } from "./movement-types";

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
 * Ready when the head, shoulders, hips, knees, and ankles are visible inside the image.
 * The body may stand on the left, the center, or the right. There is no standing box.
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
  const absent = [...new Set([...uniqueMissing, ...uniqueOutside])];
  if (absent.length > 0) {
    const feet = absent.includes("ankles");
    const head = absent.includes("head") || absent.includes("shoulders");
    const guidance = feet
      ? "Step back until both feet are visible."
      : head
        ? "Step back so your head and shoulders fit in frame."
        : `Move so your ${absent.join(", ")} stay in frame.`;
    return { ready: false, confidence, missing: absent, guidance };
  }
  return { ready: true, confidence, missing: [], guidance: "Hold still to calibrate your neutral stance." };
}

export function neutralFromLandmarks(landmarks: Array<Landmark | null | undefined>): NeutralPose | null {
  const leftShoulder = point(landmarks, POSE.leftShoulder);
  const rightShoulder = point(landmarks, POSE.rightShoulder);
  const leftHip = point(landmarks, POSE.leftHip);
  const rightHip = point(landmarks, POSE.rightHip);
  const leftKnee = point(landmarks, POSE.leftKnee);
  const rightKnee = point(landmarks, POSE.rightKnee);
  const leftAnkle = point(landmarks, POSE.leftAnkle);
  const rightAnkle = point(landmarks, POSE.rightAnkle);
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
    return null;
  }
  const shoulder = midpoint(leftShoulder, rightShoulder);
  const hip = midpoint(leftHip, rightHip);
  const ankle = midpoint(leftAnkle, rightAnkle);
  const torso = Math.max(0.05, Math.hypot(hip.x - shoulder.x, hip.y - shoulder.y));
  const shoulderWidth = Math.max(0.04, Math.hypot(rightShoulder.x - leftShoulder.x, rightShoulder.y - leftShoulder.y));
  const kneeAngle = (angleDegrees(leftHip, leftKnee, leftAnkle) + angleDegrees(rightHip, rightKnee, rightAnkle)) / 2;
  const wrists = wristLaterals(landmarks, shoulderWidth);
  return {
    centerX: (shoulder.x + hip.x) / 2,
    hipY: hip.y,
    shoulderY: shoulder.y,
    torso,
    shoulderWidth,
    ankleY: ankle.y,
    kneeAngle,
    thighLength: (distance(leftHip, leftKnee) + distance(rightHip, rightKnee)) / 2,
    shinLength: (distance(leftKnee, leftAnkle) + distance(rightKnee, rightAnkle)) / 2,
    leftWristLateral: wrists.left,
    rightWristLateral: wrists.right,
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
    ankleY: blend(neutral.ankleY, sample.ankleY),
    kneeAngle: blend(neutral.kneeAngle, sample.kneeAngle),
    thighLength: blend(neutral.thighLength, sample.thighLength),
    shinLength: blend(neutral.shinLength, sample.shinLength),
    leftWristLateral: blend(neutral.leftWristLateral, sample.leftWristLateral),
    rightWristLateral: blend(neutral.rightWristLateral, sample.rightWristLateral),
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
  return {
    stable: true,
    guidance: "Calibrated to your stance. You can play when the TV starts.",
    neutral: {
      centerX: average(neutrals.map((item) => item.centerX)),
      hipY: average(neutrals.map((item) => item.hipY)),
      shoulderY: average(neutrals.map((item) => item.shoulderY)),
      torso: average(neutrals.map((item) => item.torso)),
      shoulderWidth: average(neutrals.map((item) => item.shoulderWidth)),
      ankleY: average(neutrals.map((item) => item.ankleY)),
      kneeAngle: average(neutrals.map((item) => item.kneeAngle)),
      thighLength: average(neutrals.map((item) => item.thighLength)),
      shinLength: average(neutrals.map((item) => item.shinLength)),
      leftWristLateral: average(neutrals.map((item) => item.leftWristLateral)),
      rightWristLateral: average(neutrals.map((item) => item.rightWristLateral)),
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

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}
