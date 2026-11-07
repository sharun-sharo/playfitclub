/**
 * When MediaPipe returns more than one pose (numPoses > 1), pick the primary
 * player: largest body bbox, then most centered. Presence scores are not in the
 * Pose Landmarker result, so size + center is the available proxy.
 */

export interface PosePoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface PrimaryPosePick<T extends PosePoint = PosePoint> {
  /** Landmarks for the chosen person, or null when nobody is present. */
  landmarks: T[] | null;
  /** Always 0 or 1 for downstream gates that expect a single player. */
  poseCount: number;
  /** How many poses MediaPipe returned before selection. */
  rawCount: number;
  /** Index into the raw array, or -1. */
  index: number;
}

function bboxArea(pose: Array<PosePoint | null | undefined>) {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  let seen = 0;
  for (const point of pose) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if ((point.visibility ?? 1) < 0.2) continue;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    seen += 1;
  }
  if (seen < 4) return 0;
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

function centerScore(pose: Array<PosePoint | null | undefined>) {
  let sumX = 0;
  let sumY = 0;
  let seen = 0;
  for (const point of pose) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if ((point.visibility ?? 1) < 0.2) continue;
    sumX += point.x;
    sumY += point.y;
    seen += 1;
  }
  if (seen === 0) return 0;
  const cx = sumX / seen;
  const cy = sumY / seen;
  const dx = cx - 0.5;
  const dy = cy - 0.5;
  return 1 - Math.min(1, Math.hypot(dx, dy) / 0.75);
}

/** Higher is better: area dominates; center breaks ties. */
export function primaryPoseScore(pose: Array<PosePoint | null | undefined>) {
  const area = bboxArea(pose);
  if (area <= 0) return -1;
  return area * 10 + centerScore(pose);
}

export function selectPrimaryPose<T extends PosePoint>(poses: Array<T[]> | null | undefined): PrimaryPosePick<T> {
  if (!poses || poses.length === 0) {
    return { landmarks: null, poseCount: 0, rawCount: 0, index: -1 };
  }
  if (poses.length === 1) {
    return { landmarks: poses[0] ?? null, poseCount: poses[0] ? 1 : 0, rawCount: 1, index: poses[0] ? 0 : -1 };
  }
  let bestIndex = -1;
  let bestScore = -Infinity;
  for (let index = 0; index < poses.length; index += 1) {
    const pose = poses[index];
    if (!pose) continue;
    const score = primaryPoseScore(pose);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  if (bestIndex < 0 || bestScore < 0) {
    return { landmarks: null, poseCount: 0, rawCount: poses.length, index: -1 };
  }
  return {
    landmarks: poses[bestIndex] ?? null,
    poseCount: 1,
    rawCount: poses.length,
    index: bestIndex,
  };
}
