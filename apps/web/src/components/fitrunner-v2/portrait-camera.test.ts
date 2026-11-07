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
  PORTRAIT_FOV_PREF,
  PORTRAIT_ROAD_MARGIN_M,
  resolveFollowCamera,
  shouldUsePortraitFollowCamera,
} from "./portrait-camera";

const ASPECTS = [
  { name: "9:16", aspect: 9 / 16 },
  { name: "9:19.5", aspect: 9 / 19.5 },
  { name: "9:20", aspect: 9 / 20 },
] as const;

describe("portrait follow camera frustum", () => {
  it("keeps asphalt reach at the historical ~4.45 m road edge", () => {
    expect(roadLayout().roadEdge).toBeCloseTo(4.45, 5);
    expect(PORTRAIT_ROAD_MARGIN_M).toBeGreaterThanOrEqual(0);
    expect(PORTRAIT_ROAD_MARGIN_M).toBeLessThanOrEqual(0.1);
    expect(portraitRequiredWidthM()).toBeCloseTo((4.45 + PORTRAIT_ROAD_MARGIN_M) * 2, 5);
  });

  it("keeps hybrid presence: ~12–14 m distance, FOV ≥ 70, short look-ahead", () => {
    const need = portraitRequiredWidthM();
    for (const { name, aspect } of ASPECTS) {
      const cam = portraitFollowCamera(aspect);
      const atPlayer = horizontalFrustumWidth(aspect, cam.fov, cam.distance);
      const atLook = horizontalFrustumWidth(aspect, cam.fov, cam.distance + cam.lookAhead);
      expect(atPlayer, name).toBeGreaterThanOrEqual(need - 0.05);
      expect(atLook, name).toBeGreaterThan(need);
      expect(cam.fov, name).toBeGreaterThanOrEqual(PORTRAIT_FOV_PREF - 0.05);
      expect(cam.distance, name).toBeGreaterThan(fitRunnerTuning.camera.distance);
      expect(cam.distance, name).toBeLessThanOrEqual(PORTRAIT_DISTANCE_MAX + 0.01);
      expect(cam.distance, name).toBeLessThan(16);
      expect(cam.lookAhead, name).toBeLessThanOrEqual(14.01);
      expect(cam.lookAhead, name).toBeCloseTo(cam.distance, 0);
      expect(cam.height, name).toBeLessThan(3.2);
    }
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
    const fov = 70;
    const width = 9.0;
    const depth = distanceForHorizontalWidth(aspect, fov, width);
    expect(horizontalFrustumWidth(aspect, fov, depth)).toBeCloseTo(width, 5);
  });
});
