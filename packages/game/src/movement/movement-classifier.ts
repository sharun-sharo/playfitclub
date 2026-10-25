import { angleDegrees, distance, midpoint, point } from "./geometry";
import {
  POSE,
  REQUIRED_LANDMARKS,
  type ArmPose,
  type Landmark,
  type MovementThresholds,
  type NeutralPose,
  type PoseSignals,
} from "./movement-types";

/**
 * Classifies a single smoothed pose against a calibrated neutral stance.
 * MediaPipe Pose tracks body landmarks. It does not classify clothing.
 * Lane direction uses a shoulder lean past the hips, with an arm raise as the fallback.
 * MediaPipe's anatomical left stays the player's left after the selfie mirror flips x.
 * Jump speed is a hip-rise estimate. A fixed monocular camera cannot measure
 * real-world height or prove that both feet left the ground.
 */
export function classifyPose(
  landmarks: Array<Landmark | null | undefined>,
  neutral: NeutralPose,
  thresholds: MovementThresholds,
  riseSpeed: number,
): PoseSignals {
  const core = [POSE.leftShoulder, POSE.rightShoulder, POSE.leftHip, POSE.rightHip];
  for (const index of core) {
    const landmark = landmarks[index];
    if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) {
      return { ...emptySignals(), ok: false, reason: "missing", confidence: 0 };
    }
    if ((landmark.visibility ?? 0) < thresholds.minVisibility) {
      return { ...emptySignals(), ok: false, reason: "low_confidence", confidence: landmark.visibility ?? 0 };
    }
  }

  // A joint under the visibility floor is not a measurement. It must not pull this
  // average under the action gate, and it must not be read as a knee or an ankle.
  let visibility = 0;
  let counted = 0;
  for (const index of REQUIRED_LANDMARKS) {
    const landmark = landmarks[index];
    if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) continue;
    if ((landmark.visibility ?? 0) < thresholds.minVisibility) continue;
    visibility += landmark.visibility ?? 0;
    counted += 1;
  }

  const leftShoulder = point(landmarks, POSE.leftShoulder)!;
  const rightShoulder = point(landmarks, POSE.rightShoulder)!;
  const leftElbow = point(landmarks, POSE.leftElbow);
  const rightElbow = point(landmarks, POSE.rightElbow);
  const leftWrist = point(landmarks, POSE.leftWrist);
  const rightWrist = point(landmarks, POSE.rightWrist);
  const leftHip = point(landmarks, POSE.leftHip)!;
  const rightHip = point(landmarks, POSE.rightHip)!;
  const leftAnkle = point(landmarks, POSE.leftAnkle);
  const rightAnkle = point(landmarks, POSE.rightAnkle);
  const anklesReady = [POSE.leftAnkle, POSE.rightAnkle].every((index) => {
    const landmark = landmarks[index];
    return Boolean(landmark && (landmark.visibility ?? 0) >= thresholds.minVisibility);
  });

  const shoulder = midpoint(leftShoulder, rightShoulder);
  const hip = midpoint(leftHip, rightHip);
  const ankle = anklesReady && leftAnkle && rightAnkle ? midpoint(leftAnkle, rightAnkle) : null;
  const centerX = (shoulder.x + hip.x) / 2;
  const shoulderTilt = (leftShoulder.y - rightShoulder.y) / neutral.shoulderWidth;
  const lean = (neutral.centerX - centerX) / neutral.shoulderWidth + shoulderTilt * 0.45;
  // Standing torso is the scale. A missing shoulder or hip already returned above, so this is a real pair.
  const shoulderHip = (shoulder.x - hip.x) / Math.max(0.05, neutral.torso);
  // mirrorFrame already flipped shoulder and wrist x. Physical left is the positive direction.
  const torsoLean = (neutral.shoulderHip ?? 0) - shoulderHip;
  const hipDrop = (hip.y - neutral.hipY) / neutral.torso;
  const leftHip3 = vec3(landmarks[POSE.leftHip]);
  const rightHip3 = vec3(landmarks[POSE.rightHip]);
  const leftKnee3 = vec3(landmarks[POSE.leftKnee]);
  const rightKnee3 = vec3(landmarks[POSE.rightKnee]);
  const leftAnkle3 = vec3(landmarks[POSE.leftAnkle]);
  const rightAnkle3 = vec3(landmarks[POSE.rightAnkle]);
  const depthKnee =
    leftHip3 && rightHip3 && leftKnee3 && rightKnee3 && leftAnkle3 && rightAnkle3
      ? (angle3(leftHip3, leftKnee3, leftAnkle3) + angle3(rightHip3, rightKnee3, rightAnkle3)) / 2
      : neutral.kneeAngle;
  const depthShin = shinFlex(leftKnee3, rightKnee3, leftAnkle3, rightAnkle3);
  const shortened = legShortening(landmarks, neutral, thresholds.minVisibility);
  // A front-camera squat keeps the knee stacked in x. Depth from the lite model is often
  // too small to close angle3, but the thigh and shin get shorter in the image.
  const kneeAngle = Math.min(depthKnee, shortened.kneeAngle);
  const ankleFlex = Math.max(depthShin, shortened.shinTilt);
  const ankleRise = ankle ? (neutral.ankleY - ankle.y) / neutral.torso : 0;
  const leftExtension = extension(leftShoulder, leftElbow, leftWrist);
  const rightExtension = extension(rightShoulder, rightElbow, rightWrist);
  const armsOut = armSpan(leftShoulder, rightShoulder, leftWrist, rightWrist);
  const leftArm = measureArm(landmarks[POSE.leftElbow], landmarks[POSE.leftWrist], leftShoulder, rightShoulder, neutral, thresholds.minVisibility);
  const rightArm = measureArm(landmarks[POSE.rightElbow], landmarks[POSE.rightWrist], rightShoulder, leftShoulder, neutral, thresholds.minVisibility);
  const shoulderDrop = (shoulder.y - neutral.shoulderY) / neutral.torso;
  const kneeFlex = neutral.kneeAngle - kneeAngle;
  const torsoNow = Math.max(0.001, Math.hypot(hip.x - shoulder.x, hip.y - shoulder.y));
  const legsReady = [POSE.leftKnee, POSE.rightKnee, POSE.leftAnkle, POSE.rightAnkle].every((index) => {
    const landmark = landmarks[index];
    return Boolean(landmark && Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && (landmark.visibility ?? 0) >= thresholds.minVisibility);
  });
  const torsoRatio = torsoNow / neutral.torso;
  // 0.90 is a clear shorten against the standing torso. A few percent is a bow, not a duck.
  const torsoFold = torsoRatio < 0.9;
  const coveredBow = !legsReady && hipDrop < thresholds.squatEnterDrop && torsoRatio < 0.72;
  const visibleBow = legsReady && kneeFlex < 12 && (shoulderDrop > hipDrop + 0.18 || torsoRatio < 0.72);
  const forwardBend = coveredBow || visibleBow;
  let bodyVisible = 0;
  for (const index of REQUIRED_LANDMARKS) {
    const landmark = landmarks[index];
    if (landmark && Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && (landmark.visibility ?? 0) >= thresholds.minVisibility) {
      bodyVisible += 1;
    }
  }

  return {
    ok: true,
    confidence: counted > 0 ? visibility / counted : 0,
    lean,
    torsoLean,
    hipDrop,
    kneeAngle,
    riseSpeed,
    hipVelocity: 0,
    hipRise: 0,
    shoulderRise: 0,
    ankleVelocity: 0,
    ankleRise,
    kneeFlex,
    ankleFlex,
    bodyVisibility: bodyVisible / REQUIRED_LANDMARKS.length,
    leftExtension,
    rightExtension,
    armsOut,
    leftArm,
    rightArm,
    legsReady,
    forwardBend,
    torsoFold,
    shoulderVelocity: 0,
  };
}

/**
 * Outward is the anatomical direction from the other shoulder toward this shoulder.
 * Mirroring x flips both the axis and the wrist, so the player's physical left stays left.
 */
function measureArm(
  elbow: Landmark | null | undefined,
  wrist: Landmark | null | undefined,
  shoulder: { x: number; y: number },
  otherShoulder: { x: number; y: number },
  neutral: NeutralPose,
  minVisibility: number,
): ArmPose {
  const hidden = { lateral: 0, height: 1, elbowAngle: 0, reach: 0, elevation: 0, visible: false };
  if (!elbow || !wrist) return hidden;
  if ((elbow.visibility ?? 0) < minVisibility || (wrist.visibility ?? 0) < minVisibility) return hidden;
  if (!Number.isFinite(elbow.x) || !Number.isFinite(elbow.y) || !Number.isFinite(wrist.x) || !Number.isFinite(wrist.y)) return hidden;
  const axisX = shoulder.x - otherShoulder.x;
  const axisY = shoulder.y - otherShoulder.y;
  const axis = Math.hypot(axisX, axisY) || neutral.shoulderWidth || 1;
  const dx = wrist.x - shoulder.x;
  const dy = wrist.y - shoulder.y;
  const outward = dx * (axisX / axis) + dy * (axisY / axis);
  const crossed = outward < -0.35 * axis;
  return {
    lateral: outward / Math.max(0.04, neutral.shoulderWidth),
    height: dy / Math.max(0.05, neutral.torso),
    reach: Math.hypot(dx, dy) / Math.max(0.04, neutral.shoulderWidth),
    elevation: crossed ? 0 : (Math.atan2(Math.max(outward, 0), dy) * 180) / Math.PI,
    elbowAngle: angleDegrees(shoulder, elbow, wrist),
    visible: true,
  };
}

/** 0 when the shin is vertical. Larger when the knee sits forward of a planted ankle, including camera depth. */
function shinFlex(
  leftKnee: Vec3 | null,
  rightKnee: Vec3 | null,
  leftAnkle: Vec3 | null,
  rightAnkle: Vec3 | null,
) {
  const sides = [flexOne(leftKnee, leftAnkle), flexOne(rightKnee, rightAnkle)].filter((value) => value !== null);
  if (sides.length === 0) return 0;
  return sides.reduce((sum, value) => sum + value, 0) / sides.length;
}

function flexOne(knee: Vec3 | null, ankle: Vec3 | null) {
  if (!knee || !ankle) return null;
  const rise = Math.max(0.001, ankle.y - knee.y);
  const forward = Math.hypot(knee.x - ankle.x, knee.z - ankle.z);
  return (Math.atan2(forward, rise) * 180) / Math.PI;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function vec3(landmark: Landmark | null | undefined): Vec3 | null {
  if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return null;
  return { x: landmark.x, y: landmark.y, z: Number.isFinite(landmark.z) ? (landmark.z as number) : 0 };
}

/**
 * Image thigh and shin compared with the standing lengths. The first 8% is treated as
 * noise. z is not used: MediaPipe's width-scale z and a 0.05m world knee both leave
 * the 3D angle open on a stacked front squat.
 */
function legShortening(
  landmarks: Array<Landmark | null | undefined>,
  neutral: NeutralPose,
  minVisibility: number,
): { kneeAngle: number; shinTilt: number } {
  const open = { kneeAngle: 180, shinTilt: 0 };
  const thigh = meanSegment(landmarks, [
    [POSE.leftHip, POSE.leftKnee],
    [POSE.rightHip, POSE.rightKnee],
  ], minVisibility);
  const shin = meanSegment(landmarks, [
    [POSE.leftKnee, POSE.leftAnkle],
    [POSE.rightKnee, POSE.rightAnkle],
  ], minVisibility);
  if (thigh === null && shin === null) return open;
  const thighTilt = thigh === null ? 0 : tiltFromShortening(thigh, neutral.thighLength);
  const shinTilt = shin === null ? 0 : tiltFromShortening(shin, neutral.shinLength);
  return { kneeAngle: 180 - thighTilt - shinTilt, shinTilt };
}

function meanSegment(
  landmarks: Array<Landmark | null | undefined>,
  pairs: Array<[number, number]>,
  minVisibility: number,
): number | null {
  const lengths: number[] = [];
  for (const [from, to] of pairs) {
    const a = landmarks[from];
    const b = landmarks[to];
    if (!a || !b) continue;
    if ((a.visibility ?? 0) < minVisibility || (b.visibility ?? 0) < minVisibility) continue;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    lengths.push(Math.hypot(a.x - b.x, a.y - b.y));
  }
  if (lengths.length === 0) return null;
  return lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
}

function tiltFromShortening(current: number, standing: number): number {
  if (!(standing > 0.02) || !(current > 0)) return 0;
  const ratio = current / standing;
  const slack = 0.92;
  if (ratio >= slack) return 0;
  const cosine = Math.min(1, Math.max(0, ratio / slack));
  return (Math.acos(cosine) * 180) / Math.PI;
}

/**
 * Hip–knee–ankle angle. z is image-y depth from alignLandmarkDepth, not raw MediaPipe z
 * and not meters. Front-camera flexion also uses legShortening, because this angle
 * stays open when that depth is only a few centimeters.
 */
function angle3(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = ab.x * cb.x + ab.y * cb.y + ab.z * cb.z;
  const mag = Math.hypot(ab.x, ab.y, ab.z) * Math.hypot(cb.x, cb.y, cb.z);
  if (mag === 0) return 180;
  const cosine = Math.min(1, Math.max(-1, dot / mag));
  return (Math.acos(cosine) * 180) / Math.PI;
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

/** Hanging-wrist outward scores for a neutral stance. Screen position is not part of the score. */
export function wristLaterals(
  landmarks: Array<Landmark | null | undefined>,
  shoulderWidth: number,
): { left: number; right: number } {
  const leftShoulder = point(landmarks, POSE.leftShoulder);
  const rightShoulder = point(landmarks, POSE.rightShoulder);
  if (!leftShoulder || !rightShoulder) return { left: 0, right: 0 };
  const neutral: NeutralPose = {
    centerX: 0,
    hipY: 0,
    shoulderY: 0,
    torso: 1,
    shoulderWidth,
    ankleY: 0,
    kneeAngle: 180,
    thighLength: 1,
    shinLength: 1,
    leftWristLateral: 0,
    rightWristLateral: 0,
    shoulderHip: 0,
  };
  return {
    left: measureArm(landmarks[POSE.leftElbow], landmarks[POSE.leftWrist], leftShoulder, rightShoulder, neutral, 0).lateral,
    right: measureArm(landmarks[POSE.rightElbow], landmarks[POSE.rightWrist], rightShoulder, leftShoulder, neutral, 0).lateral,
  };
}

function emptySignals(): PoseSignals {
  return {
    ok: false,
    confidence: 0,
    lean: 0,
    torsoLean: 0,
    hipDrop: 0,
    kneeAngle: 180,
    riseSpeed: 0,
    hipVelocity: 0,
    hipRise: 0,
    shoulderRise: 0,
    ankleVelocity: 0,
    ankleRise: 0,
    kneeFlex: 0,
    ankleFlex: 0,
    bodyVisibility: 0,
    leftExtension: 0,
    rightExtension: 0,
    armsOut: 0,
    leftArm: { lateral: 0, height: 1, elbowAngle: 0, reach: 0, elevation: 0, visible: false },
    rightArm: { lateral: 0, height: 1, elbowAngle: 0, reach: 0, elevation: 0, visible: false },
    legsReady: false,
    forwardBend: false,
    torsoFold: false,
    shoulderVelocity: 0,
  };
}
