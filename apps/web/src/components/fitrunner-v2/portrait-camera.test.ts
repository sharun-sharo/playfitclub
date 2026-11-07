import { describe, expect, it } from "vitest";
import { fitRunnerTuning } from "./tuning";
import {
  distanceForHorizontalWidth,
  followCameraTrackX,
  horizontalFrustumWidth,
  landscapeFollowCamera,
  portraitFollowCamera,
  portraitRequiredWidthM,
  PORTRAIT_CAMERA_HEIGHT,
  PORTRAIT_DISTANCE_HARD_MAX,
  PORTRAIT_DISTANCE_MAX,
  PORTRAIT_DISTANCE_MIN,
  PORTRAIT_FOLLOW_HALF_WIDTH_M,
  PORTRAIT_FOLLOW_SMOOTH,
  PORTRAIT_FOV_MAX,
  PORTRAIT_FOV_PREF,
  PORTRAIT_LOOK_AHEAD_FACTOR,
  PORTRAIT_LOOK_HEIGHT,
  resolveFollowCamera,
  shouldUsePortraitFollowCamera,
} from "./portrait-camera";

const ASPECTS = [
  { name: "9:16", aspect: 9 / 16 },
  { name: "9:19.5", aspect: 9 / 19.5 },
  { name: "9:20", aspect: 9 / 20 },
  { name: "390x844", aspect: 390 / 844 },
] as const;

describe("portrait follow camera frustum", () => {
  it("frames character-centered width, not the full static 3-lane road", () => {
    expect(PORTRAIT_FOLLOW_HALF_WIDTH_M).toBeGreaterThan(0.85);
    expect(PORTRAIT_FOLLOW_HALF_WIDTH_M).toBeLessThan(fitRunnerTuning.laneSpacing);
    expect(portraitRequiredWidthM()).toBeCloseTo(Math.min(PORTRAIT_FOLLOW_HALF_WIDTH_M, fitRunnerTuning.laneSpacing * 0.4) * 2, 5);
    expect(portraitRequiredWidthM() / 2).toBeLessThan(fitRunnerTuning.laneSpacing);
    expect(portraitRequiredWidthM() / 2).toBeGreaterThan(0.85);
  });

  it("keeps bottom-near OTS presence: ~2.15–2.5 m distance, torso+ look-at, FOV ~68–82", () => {
    const need = portraitRequiredWidthM();
    expect(PORTRAIT_FOV_PREF).toBeGreaterThanOrEqual(64);
    expect(PORTRAIT_FOV_MAX).toBeLessThanOrEqual(82);
    expect(PORTRAIT_DISTANCE_MIN).toBeGreaterThanOrEqual(2);
    expect(PORTRAIT_DISTANCE_MAX).toBeLessThanOrEqual(2.5);
    expect(PORTRAIT_DISTANCE_HARD_MAX).toBeLessThanOrEqual(2.9);
    expect(PORTRAIT_LOOK_AHEAD_FACTOR).toBeLessThanOrEqual(0.65);
    expect(PORTRAIT_LOOK_AHEAD_FACTOR).toBeGreaterThanOrEqual(0.5);
    // Look-at at/above torso so the nearer runner sits below center (bottom of frame).
    expect(PORTRAIT_LOOK_HEIGHT).toBeGreaterThanOrEqual(1.15);
    expect(PORTRAIT_CAMERA_HEIGHT).toBeGreaterThan(PORTRAIT_LOOK_HEIGHT);
    expect(PORTRAIT_CAMERA_HEIGHT).toBeLessThan(1.9);
    expect(PORTRAIT_FOLLOW_SMOOTH).toBeGreaterThan(fitRunnerTuning.camera.smooth);

    for (const { name, aspect } of ASPECTS) {
      const cam = portraitFollowCamera(aspect);
      const atPlayer = horizontalFrustumWidth(aspect, cam.fov, cam.distance);
      const atLook = horizontalFrustumWidth(aspect, cam.fov, cam.distance + cam.lookAhead);
      expect(atPlayer, name).toBeGreaterThanOrEqual(need - 0.05);
      expect(atLook, name).toBeGreaterThan(need);
      expect(cam.fov, name).toBeGreaterThanOrEqual(PORTRAIT_FOV_PREF - 0.05);
      expect(cam.fov, name).toBeLessThanOrEqual(PORTRAIT_FOV_MAX + 0.05);
      // Much nearer than the rejected ~5.5–7.25 m sky-heavy framing.
      expect(cam.distance, name).toBeLessThan(2.9);
      expect(cam.distance, name).toBeGreaterThanOrEqual(PORTRAIT_DISTANCE_MIN - 0.01);
      expect(cam.distance, name).toBeLessThanOrEqual(PORTRAIT_DISTANCE_HARD_MAX + 0.01);
      expect(cam.lookAhead, name).toBeLessThanOrEqual(cam.distance * 0.65 + 0.01);
      expect(cam.lookAhead / cam.distance, name).toBeGreaterThanOrEqual(0.49);
      expect(cam.lookAhead / cam.distance, name).toBeLessThanOrEqual(0.66);
      expect(cam.lookHeight, name).toBe(PORTRAIT_LOOK_HEIGHT);
      expect(cam.height, name).toBe(PORTRAIT_CAMERA_HEIGHT);
      expect(cam.height, name).toBeGreaterThan(cam.lookHeight);
      expect(cam.smooth, name).toBe(PORTRAIT_FOLLOW_SMOOTH);
    }
  });

  it("targets ~2.15–2.5 m / bottom-near OTS framing at a typical phone portrait (390×844)", () => {
    const cam = portraitFollowCamera(390 / 844);
    expect(cam.fov).toBeGreaterThanOrEqual(66);
    expect(cam.distance).toBeGreaterThanOrEqual(2.15);
    expect(cam.distance).toBeLessThanOrEqual(2.5);
    expect(cam.lookAhead).toBeLessThanOrEqual(cam.distance * 0.65);
    expect(cam.lookHeight).toBeGreaterThanOrEqual(1.15);
    expect(cam.height).toBe(PORTRAIT_CAMERA_HEIGHT);
    expect(cam.height).toBeGreaterThan(cam.lookHeight);
  });

  it("leaves landscape framing on wide aspects and when framing is not requested", () => {
    const land = landscapeFollowCamera();
    expect(land.fov).toBe(47);
    expect(land.distance).toBe(4.35);
    expect(resolveFollowCamera("landscape", 9 / 16)).toEqual(land);
    expect(resolveFollowCamera(undefined, 9 / 16)).toEqual(land);
    expect(resolveFollowCamera("portrait-when-tall", 16 / 9)).toEqual(land);
    expect(shouldUsePortraitFollowCamera("portrait-when-tall", 9 / 16)).toBe(true);
    expect(shouldUsePortraitFollowCamera("portrait-when-tall", 16 / 9)).toBe(false);
  });

  it("tracks runner lane X in portrait and landscape so the character stays centered", () => {
    const left = -fitRunnerTuning.laneSpacing;
    const right = fitRunnerTuning.laneSpacing;
    expect(followCameraTrackX(true, left)).toBe(left);
    expect(followCameraTrackX(true, 0)).toBe(0);
    expect(followCameraTrackX(true, right)).toBe(right);
    expect(followCameraTrackX(false, left)).toBe(left);
    expect(followCameraTrackX(false, right)).toBe(right);
  });

  it("covers required character-centered width at player depth", () => {
    const need = portraitRequiredWidthM();
    const cam = portraitFollowCamera(390 / 844);
    expect(horizontalFrustumWidth(390 / 844, cam.fov, cam.distance)).toBeGreaterThanOrEqual(need - 0.05);
    expect(need / 2).toBeCloseTo(Math.min(PORTRAIT_FOLLOW_HALF_WIDTH_M, fitRunnerTuning.laneSpacing * 0.4), 5);
  });

  it("matches the distance helper against the width helper", () => {
    const aspect = 9 / 16;
    const fov = 78;
    const width = 8.9;
    const depth = distanceForHorizontalWidth(aspect, fov, width);
    expect(horizontalFrustumWidth(aspect, fov, depth)).toBeCloseTo(width, 5);
  });
});
