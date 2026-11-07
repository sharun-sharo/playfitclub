import { describe, expect, it } from "vitest";
import { roadLayout } from "./road-width";
import { fitRunnerTuning } from "./tuning";
import {
  distanceForHorizontalWidth,
  horizontalFrustumWidth,
  landscapeFollowCamera,
  portraitFollowCamera,
  portraitRequiredWidthM,
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
  it("keeps asphalt reach at the historical ~4.45 m road edge", () => {
    expect(roadLayout().roadEdge).toBeCloseTo(4.45, 5);
    expect(PORTRAIT_ROAD_MARGIN_M).toBeGreaterThanOrEqual(-0.1);
    expect(PORTRAIT_ROAD_MARGIN_M).toBeLessThanOrEqual(0.1);
    expect(portraitRequiredWidthM()).toBeCloseTo((4.45 + PORTRAIT_ROAD_MARGIN_M) * 2, 5);
  });

  it("keeps aggressive hybrid presence: ~9–11 m distance, FOV ≥ 82, look-ahead ~0.8–0.9×", () => {
    const need = portraitRequiredWidthM();
    expect(PORTRAIT_FOV_PREF).toBeGreaterThanOrEqual(82);
    expect(PORTRAIT_FOV_MAX).toBeLessThanOrEqual(85);
    expect(PORTRAIT_DISTANCE_MIN).toBeGreaterThanOrEqual(9);
    expect(PORTRAIT_DISTANCE_MAX).toBeLessThanOrEqual(11);
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
      expect(cam.distance, name).toBeLessThanOrEqual(PORTRAIT_DISTANCE_MAX + 0.01);
      expect(cam.lookAhead, name).toBeLessThanOrEqual(cam.distance * 0.9 + 0.01);
      expect(cam.lookAhead / cam.distance, name).toBeGreaterThanOrEqual(0.79);
      expect(cam.lookAhead / cam.distance, name).toBeLessThanOrEqual(0.91);
      expect(cam.height, name).toBeLessThan(1.6);
      expect(cam.lookHeight, name).toBeLessThanOrEqual(0.75);
    }
  });

  it("targets ~11 m / FOV ~82 at a typical phone portrait (390×844)", () => {
    const cam = portraitFollowCamera(390 / 844);
    expect(cam.fov).toBeGreaterThanOrEqual(82);
    expect(cam.distance).toBeGreaterThanOrEqual(9);
    expect(cam.distance).toBeLessThanOrEqual(11);
    expect(cam.lookAhead).toBeLessThanOrEqual(cam.distance * 0.9);
    expect(cam.height).toBeLessThan(1.45);
    expect(cam.lookHeight).toBeLessThanOrEqual(0.75);
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

  it("matches the distance helper against the width helper", () => {
    const aspect = 9 / 16;
    const fov = 78;
    const width = 8.9;
    const depth = distanceForHorizontalWidth(aspect, fov, width);
    expect(horizontalFrustumWidth(aspect, fov, depth)).toBeCloseTo(width, 5);
  });
});
