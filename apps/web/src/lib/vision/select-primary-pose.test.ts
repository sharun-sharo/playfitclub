import { describe, expect, it } from "vitest";
import { primaryPoseScore, selectPrimaryPose, type PosePoint } from "./select-primary-pose";

function figure(scale: number, centerX = 0.5): PosePoint[] {
  const points: PosePoint[] = Array.from({ length: 33 }, () => ({ x: centerX, y: 0.5, visibility: 0 }));
  const halfW = 0.08 * scale;
  const headY = 0.5 - 0.32 * scale;
  const shoulderY = 0.5 - 0.2 * scale;
  const hipY = 0.5 + 0.05 * scale;
  const ankleY = 0.5 + 0.35 * scale;
  const set = (index: number, x: number, y: number) => {
    points[index] = { x, y, visibility: 0.95 };
  };
  set(0, centerX, headY);
  set(11, centerX - halfW, shoulderY);
  set(12, centerX + halfW, shoulderY);
  set(23, centerX - halfW * 0.7, hipY);
  set(24, centerX + halfW * 0.7, hipY);
  set(25, centerX - halfW * 0.6, (hipY + ankleY) / 2);
  set(26, centerX + halfW * 0.6, (hipY + ankleY) / 2);
  set(27, centerX - halfW * 0.5, ankleY);
  set(28, centerX + halfW * 0.5, ankleY);
  return points;
}

describe("selectPrimaryPose", () => {
  it("returns empty when nobody is present", () => {
    expect(selectPrimaryPose([])).toEqual({ landmarks: null, poseCount: 0, rawCount: 0, index: -1 });
    expect(selectPrimaryPose(undefined).poseCount).toBe(0);
  });

  it("keeps a single pose as the player", () => {
    const one = figure(1);
    const pick = selectPrimaryPose([one]);
    expect(pick.poseCount).toBe(1);
    expect(pick.rawCount).toBe(1);
    expect(pick.index).toBe(0);
    expect(pick.landmarks).toBe(one);
  });

  it("prefers the larger figure when two people are present", () => {
    const small = figure(0.45, 0.5);
    const large = figure(1.2, 0.55);
    const pick = selectPrimaryPose([small, large]);
    expect(pick.poseCount).toBe(1);
    expect(pick.rawCount).toBe(2);
    expect(pick.index).toBe(1);
    expect(pick.landmarks).toBe(large);
    expect(primaryPoseScore(large)).toBeGreaterThan(primaryPoseScore(small));
  });

  it("prefers the more centered figure when sizes match", () => {
    const left = figure(1, 0.22);
    const center = figure(1, 0.5);
    const pick = selectPrimaryPose([left, center]);
    expect(pick.index).toBe(1);
    expect(pick.landmarks).toBe(center);
  });
});
