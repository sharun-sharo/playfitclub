import { angleDegrees, distance, midpoint, point } from "./geometry";
import {
  POSE,
  REQUIRED_LANDMARKS,
  type Landmark,
  type MovementThresholds,
  type NeutralPose,
  type PoseSignals,
} from "./movement-types";

/**
 * Classifies a single smoothed pose against a calibrated neutral stance.
 * Jump speed is estimated from image motion. A fixed monocular camera cannot
 * measure real-world vertical displacement, so jump output is a gameplay estimate.
 */
export function classifyPose(
  landmarks: Array<Landmark | null | undefined>,
  neutral: NeutralPose,
  thresholds: MovementThresholds,
  riseSpeed: number,
): PoseSignals {
  let visibility = 0;
  let counted = 0;
  for (const index of REQUIRED_LANDMARKS) {
    const landmark = landmarks[index];
    counted += 1;
    if (!landmark) {
      return { ...emptySignals(), ok: false, reason: "missing", confidence: 0 };
    }
    const value = landmark.visibility ?? 0;
    visibility += value;
    if (value < thresholds.minVisibility) {
      return { ...emptySignals(), ok: false, reason: "low_confidence", confidence: visibility / counted };
    }
  }

  const leftShoulder = point(landmarks, POSE.leftShoulder)!;
  const rightShoulder = point(landmarks, POSE.rightShoulder)!;
  const leftElbow = point(landmarks, POSE.leftElbow);
  const rightElbow = point(landmarks, POSE.rightElbow);
  const leftWrist = point(landmarks, POSE.leftWrist);
  const rightWrist = point(landmarks, POSE.rightWrist);
  const leftHip = point(landmarks, POSE.leftHip)!;
  const rightHip = point(landmarks, POSE.rightHip)!;
  const leftKnee = point(landmarks, POSE.leftKnee)!;
  const rightKnee = point(landmarks, POSE.rightKnee)!;
  const leftAnkle = point(landmarks, POSE.leftAnkle)!;
  const rightAnkle = point(landmarks, POSE.rightAnkle)!;

  const shoulder = midpoint(leftShoulder, rightShoulder);
  const hip = midpoint(leftHip, rightHip);
  const ankle = midpoint(leftAnkle, rightAnkle);
  const centerX = (shoulder.x + hip.x) / 2;
  const shoulderTilt = (leftShoulder.y - rightShoulder.y) / neutral.shoulderWidth;
  const lean = (neutral.centerX - centerX) / neutral.shoulderWidth + shoulderTilt * 0.45;
  const hipDrop = (hip.y - neutral.hipY) / neutral.torso;
  const kneeAngle = (angleDegrees(leftHip, leftKnee, leftAnkle) + angleDegrees(rightHip, rightKnee, rightAnkle)) / 2;
  const ankleRise = (neutral.ankleY - ankle.y) / neutral.torso;
  const leftExtension = extension(leftShoulder, leftElbow, leftWrist);
  const rightExtension = extension(rightShoulder, rightElbow, rightWrist);
  const armsOut = armSpan(leftShoulder, rightShoulder, leftWrist, rightWrist);

  return {
    ok: true,
    confidence: visibility / REQUIRED_LANDMARKS.length,
    lean,
    hipDrop,
    kneeAngle,
    riseSpeed,
    ankleRise,
    leftExtension,
    rightExtension,
    armsOut,
  };
}

function extension(shoulder: { x: number; y: number }, elbow: { x: number; y: number } | null, wrist: { x: number; y: number } | null): number {
  if (!elbow || !wrist) return 0;
  const upper = Math.max(0.001, distance(shoulder, elbow));
  return distance(shoulder, wrist) / upper;
}

function armSpan(
  leftShoulder: { x: number; y: number },
  rightShoulder: { x: number; y: number },
  leftWrist: { x: number; y: number } | null,
  rightWrist: { x: number; y: number } | null,
): number {
  if (!leftWrist || !rightWrist) return 0;
  const width = Math.max(0.001, distance(leftShoulder, rightShoulder));
  return distance(leftWrist, rightWrist) / width;
}

function emptySignals(): PoseSignals {
  return {
    ok: false,
    confidence: 0,
    lean: 0,
    hipDrop: 0,
    kneeAngle: 180,
    riseSpeed: 0,
    ankleRise: 0,
    leftExtension: 0,
    rightExtension: 0,
    armsOut: 0,
  };
}
