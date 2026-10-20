import type { Landmark, PoseFrame } from "./movement-types";

export function smoothFrame(
  previous: Array<{ x: number; y: number } | null>,
  frame: PoseFrame,
  alpha: number,
): { smoother: Array<{ x: number; y: number } | null>; landmarks: Array<Landmark | null> } {
  const count = Math.max(previous.length, frame.landmarks.length, 33);
  const smoother: Array<{ x: number; y: number } | null> = [];
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
    const next = prior
      ? { x: prior.x + (sample.x - prior.x) * alpha, y: prior.y + (sample.y - prior.y) * alpha }
      : { x: sample.x, y: sample.y };
    smoother[index] = next;
    landmarks[index] = { ...sample, x: next.x, y: next.y };
  }
  return { smoother, landmarks };
}
