import { angleDegrees, midpoint, point } from "./geometry";
import { POSE, REQUIRED_LANDMARKS, type Landmark, type NeutralPose, type PoseFrame } from "./movement-types";

export interface FramingAssessment {
  ready: boolean;
  confidence: number;
  guidance: string;
  missing: string[];
}

export function assessFraming(landmarks: Array<Landmark | null | undefined>, minVisibility: number): FramingAssessment {
  const missing: string[] = [];
  const labels: Record<number, string> = {
    [POSE.leftShoulder]: "shoulders",
    [POSE.rightShoulder]: "shoulders",
    [POSE.leftHip]: "hips",
    [POSE.rightHip]: "hips",
    [POSE.leftKnee]: "knees",
    [POSE.rightKnee]: "knees",
    [POSE.leftAnkle]: "ankles",
    [POSE.rightAnkle]: "ankles",
  };
  let visibilityTotal = 0;
  for (const index of REQUIRED_LANDMARKS) {
    const landmark = landmarks[index];
    const visibility = landmark?.visibility ?? 0;
    visibilityTotal += visibility;
    if (!landmark || visibility < minVisibility) missing.push(labels[index] ?? "body");
  }
  const uniqueMissing = [...new Set(missing)];
  const confidence = visibilityTotal / REQUIRED_LANDMARKS.length;
  if (uniqueMissing.length > 0) {
    return {
      ready: false,
      confidence,
      missing: uniqueMissing,
      guidance: `Move so your ${uniqueMissing.join(", ")} stay in frame.`,
    };
  }

  const shoulders = midpoint(point(landmarks, POSE.leftShoulder), point(landmarks, POSE.rightShoulder));
  const ankles = midpoint(point(landmarks, POSE.leftAnkle), point(landmarks, POSE.rightAnkle));
  if (shoulders.y > 0.5) {
    return { ready: false, confidence, missing: [], guidance: "Step back so your head and shoulders fit in frame." };
  }
  if (ankles.y < 0.68) {
    return { ready: false, confidence, missing: [], guidance: "Step back until both feet are visible." };
  }
  if (ankles.y - shoulders.y < 0.28) {
    return { ready: false, confidence, missing: [], guidance: "The camera needs your full body, from shoulders to feet." };
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
  return {
    centerX: (shoulder.x + hip.x) / 2,
    hipY: hip.y,
    shoulderY: shoulder.y,
    torso,
    shoulderWidth,
    ankleY: ankle.y,
    kneeAngle,
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
    },
  };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}
