import { describe, expect, it } from "vitest";
import { roadLayout } from "./road-width";
import { fitRunnerTuning } from "./tuning";
import {
  distanceForHorizontalWidth,
  followCameraTrackX,
  horizontalFrustumWidth,
  landscapeFollowCamera,
  portraitFollowCamera,
  portraitRequiredWidthM,
  PORTRAIT_CAMERA_LOCK_X,
  PORTRAIT_DISTANCE_HARD_MAX,
  PORTRAIT_DISTANCE_MAX,
  PORTRAIT_DISTANCE_MIN,
  PORTRAIT_FOV_MAX,
  PORTRAIT_FOV_PREF,
  PORTRAIT_LOOK_AHEAD_FACTOR,
  PORTRAIT_ROAD_MARGIN_M,
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
  it("keeps asphalt reach near the historical ~4.45 m road edge with an outer lip crop", () => {
    expect(roadLayout().roadEdge).toBeCloseTo(4.45, 5);
    expect(PORTRAIT_ROAD_MARGIN_M).toBeGreaterThanOrEqual(-1);
    expect(PORTRAIT_ROAD_MARGIN_M).toBeLessThan(0);
    expect(portraitRequiredWidthM()).toBeCloseTo((4.45 + PORTRAIT_ROAD_MARGIN_M) * 2, 5);
    // Outer lane centers (±3 m) stay inside the required half-width.
    expect(portraitRequiredWidthM() / 2).toBeGreaterThan(fitRunnerTuning.laneSpacing + 0.45);
  });

  it("keeps aggressive presence: ~6.5–7.25 m distance, FOV ~88–95, look-ahead ~0.8–0.9×", () => {
    const need = portraitRequiredWidthM();
    expect(PORTRAIT_FOV_PREF).toBeGreaterThanOrEqual(86);
    expect(PORTRAIT_FOV_MAX).toBeLessThanOrEqual(95);
    expect(PORTRAIT_DISTANCE_MIN).toBeGreaterThanOrEqual(6.5);
    expect(PORTRAIT_DISTANCE_MAX).toBeLessThanOrEqual(7.25);
    expect(PORTRAIT_DISTANCE_HARD_MAX).toBeLessThanOrEqual(8);
    expect(PORTRAIT_LOOK_AHEAD_FACTOR).toBeLessThanOrEqual(0.9);
    expect(PORTRAIT_LOOK_AHEAD_FACTOR).toBeGreaterThanOrEqual(0.8);

    for (const { name, aspect } of ASPECTS) {
      const cam = portraitFollowCamera(aspect);
      const atPlayer = horizontalFrustumWidth(aspect, cam.fov, cam.distance);
      const atLook = horizontalFrustumWidth(aspect, cam.fov, cam.distance + cam.lookAhead);
      expect(atPlayer, name).toBeGreaterThanOrEqual(need - 0.05);
      expect(atLook, name).toBeGreaterThan(need);
      expect(cam.fov, name).toBeGreaterThanOrEqual(PORTRAIT_FOV_PREF - 0.05);
      expect(cam.fov, name).toBeLessThanOrEqual(PORTRAIT_FOV_MAX + 0.05);
      expect(cam.distance, name).toBeGreaterThan(fitRunnerTuning.camera.distance);
      expect(cam.distance, name).toBeGreaterThanOrEqual(PORTRAIT_DISTANCE_MIN - 0.01);
      expect(cam.distance, name).toBeLessThanOrEqual(PORTRAIT_DISTANCE_HARD_MAX + 0.01);
      expect(cam.lookAhead, name).toBeLessThanOrEqual(cam.distance * 0.9 + 0.01);
      expect(cam.lookAhead / cam.distance, name).toBeGreaterThanOrEqual(0.79);
      expect(cam.lookAhead / cam.distance, name).toBeLessThanOrEqual(0.91);
      expect(cam.height, name).toBeLessThan(1.4);
      expect(cam.lookHeight, name).toBeGreaterThanOrEqual(0.85);
      expect(cam.lookHeight, name).toBeLessThanOrEqual(1.1);
      // Shallow pitch: near slab lip should not dominate the bottom of the frame.
      expect(cam.height - cam.lookHeight, name).toBeLessThanOrEqual((cam.distance + cam.lookAhead) * 0.02);
    }
  });

  it("targets ~7.25 m / FOV ~88–95 at a typical phone portrait (390×844)", () => {
    const cam = portraitFollowCamera(390 / 844);
    expect(cam.fov).toBeGreaterThanOrEqual(86);
    expect(cam.distance).toBeGreaterThanOrEqual(6.5);
    expect(cam.distance).toBeLessThanOrEqual(7.25);
    expect(cam.lookAhead).toBeLessThanOrEqual(cam.distance * 0.9);
    expect(cam.height).toBeLessThan(1.3);
    expect(cam.lookHeight).toBeGreaterThanOrEqual(0.85);
    expect(cam.lookHeight).toBeLessThanOrEqual(1.1);
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

  it("locks portrait Mobile Only follow X to road center; landscape still tracks lane X", () => {
    const left = -fitRunnerTuning.laneSpacing;
    const right = fitRunnerTuning.laneSpacing;
    expect(PORTRAIT_CAMERA_LOCK_X).toBe(0);
    expect(followCameraTrackX(true, left)).toBe(0);
    expect(followCameraTrackX(true, 0)).toBe(0);
    expect(followCameraTrackX(true, right)).toBe(0);
    expect(followCameraTrackX(false, left)).toBe(left);
    expect(followCameraTrackX(false, right)).toBe(right);
  });

  it("covers required portrait width from locked center without chasing outer lanes", () => {
    const need = portraitRequiredWidthM();
    const cam = portraitFollowCamera(390 / 844);
    // Camera X = 0: frustum at player depth must still span the required half-width.
    expect(horizontalFrustumWidth(390 / 844, cam.fov, cam.distance)).toBeGreaterThanOrEqual(need - 0.05);
    expect(need / 2).toBeCloseTo(roadLayout().roadEdge + PORTRAIT_ROAD_MARGIN_M, 5);
  });

  it("matches the distance helper against the width helper", () => {
    const aspect = 9 / 16;
    const fov = 78;
    const width = 8.9;
    const depth = distanceForHorizontalWidth(aspect, fov, width);
    expect(horizontalFrustumWidth(aspect, fov, depth)).toBeCloseTo(width, 5);
  });
});
