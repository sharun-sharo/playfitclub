import type { Landmark, PoseFrame } from "./movement-types";

/**
 * One blend per camera frame. Alpha near 1 reaches most of a step on the next sample.
 * Jump, squat, and lean onset read the raw sample, because a step that lands on the
 * line never quite arrives through this blend. The phone skeleton is drawn from the
 * camera sample, not from this blend.
 */
export function smoothFrame(
  previous: Array<{ x: number; y: number; z?: number } | null>,
  frame: PoseFrame,
  alpha: number,
): { smoother: Array<{ x: number; y: number; z?: number } | null>; landmarks: Array<Landmark | null> } {
  const count = Math.max(previous.length, frame.landmarks.length, 33);
  const smoother: Array<{ x: number; y: number; z?: number } | null> = [];
  const landmarks: Array<Landmark | null> = [];
  for (let index = 0; index < count; index += 1) {
    const sample = frame.landmarks[index];
    const prior = previous[index] ?? null;
    if (!sample || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)) {
      smoother[index] = prior;
      landmarks[index] = prior
        ? { x: prior.x, y: prior.y, visibility: sample?.visibility ?? 0 }
        : null;
      continue;
    }
    const sampleZ = Number.isFinite(sample.z) ? (sample.z as number) : 0;
    const priorZ = prior && Number.isFinite(prior.z) ? (prior.z as number) : sampleZ;
    const next = prior
      ? {
          x: prior.x + (sample.x - prior.x) * alpha,
          y: prior.y + (sample.y - prior.y) * alpha,
          z: priorZ + (sampleZ - priorZ) * alpha,
        }
      : { x: sample.x, y: sample.y, z: sampleZ };
    smoother[index] = next;
    landmarks[index] = { ...sample, x: next.x, y: next.y, z: next.z };
  }
  return { smoother, landmarks };
}
