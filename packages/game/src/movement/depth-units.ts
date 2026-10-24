import { POSE, type Landmark } from "./movement-types";

/**
 * A MediaPipe world landmark. x, y, and z are meters. The origin is the hip midpoint.
 * This is not the normalized landmark z, which uses roughly the same scale as image x.
 */
export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Depth the classifier reads on each landmark, in the same unit as image y
 * (fraction of image height). Jump speed is still image y over torso, not this z.
 *
 * Live path: world meters × (image torso length / world torso length).
 * Fallback, when world landmarks are missing: normalized z × (image width / image height),
 * because that z is on the image-width scale, not the image-height scale.
 *
 * That fallback shrinks a portrait phone's depth. A 0.05m world knee, and a missing world
 * array with normalized z around 0.02, both leave the 3D knee angle open. The classifier
 * also reads image thigh and shin length, so a squat does not depend on this scale.
 */
export function alignLandmarkDepth(
  landmarks: Array<Landmark | null | undefined>,
  world: Array<WorldPoint | null | undefined> | null | undefined,
  aspectWidthOverHeight = 1,
): Array<Landmark | null> {
  const scale = torsoMetersToImageY(landmarks, world);
  const aspect = Number.isFinite(aspectWidthOverHeight) && aspectWidthOverHeight > 0 ? aspectWidthOverHeight : 1;
  return landmarks.map((landmark, index) => {
    if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return null;
    const meters = world?.[index];
    const normalizedZ = Number.isFinite(landmark.z) ? (landmark.z as number) : 0;
    const z = meters && Number.isFinite(meters.z) && scale !== null ? meters.z * scale : normalizedZ * aspect;
    return { ...landmark, z };
  });
}

function torsoMetersToImageY(
  landmarks: Array<Landmark | null | undefined>,
  world: Array<WorldPoint | null | undefined> | null | undefined,
): number | null {
  if (!world) return null;
  const pairs = [
    [POSE.leftShoulder, POSE.leftHip],
    [POSE.rightShoulder, POSE.rightHip],
  ];
  let image = 0;
  let meters = 0;
  for (const [shoulder, hip] of pairs) {
    const imageShoulder = landmarks[shoulder];
    const imageHip = landmarks[hip];
    const worldShoulder = world[shoulder];
    const worldHip = world[hip];
    if (!imageShoulder || !imageHip || !worldShoulder || !worldHip) continue;
    const imageLength = Math.hypot(imageShoulder.x - imageHip.x, imageShoulder.y - imageHip.y);
    const worldLength = Math.hypot(
      worldShoulder.x - worldHip.x,
      worldShoulder.y - worldHip.y,
      worldShoulder.z - worldHip.z,
    );
    if (imageLength < 0.02 || worldLength < 0.05) continue;
    image += imageLength;
    meters += worldLength;
  }
  if (meters <= 0) return null;
  return image / meters;
}
