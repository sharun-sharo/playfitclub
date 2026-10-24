import { describe, expect, it } from "vitest";
import { portraitScore } from "./front-camera";
import { containFrame, inCameraFrame } from "./preview-fit";

describe("camera frame fit", () => {
  it("prefers a portrait capture over a landscape one", () => {
    expect(portraitScore(720, 1280)).toBeGreaterThan(portraitScore(1280, 720));
    expect(portraitScore(0, 0)).toBe(0);
  });

  it("fits a portrait frame to the tall stage without stretching", () => {
    const frame = containFrame(390, 700, 720, 1280);
    expect(frame.known).toBe(true);
    expect(frame.width / frame.height).toBeCloseTo(720 / 1280, 4);
    expect(frame.width).toBeLessThanOrEqual(390);
    expect(frame.height).toBeLessThanOrEqual(700);
    expect(frame.height).toBeGreaterThan(600);
  });

  it("letterboxes a landscape stream instead of cropping or stretching it", () => {
    const frame = containFrame(390, 700, 1280, 720);
    expect(frame.width).toBeCloseTo(390, 4);
    expect(frame.height).toBeCloseTo(390 * (720 / 1280), 3);
    expect(frame.y).toBeGreaterThan(0);
    expect(frame.width / frame.height).toBeCloseTo(1280 / 720, 4);
  });

  it("rejects landmarks predicted outside the camera image", () => {
    expect(inCameraFrame({ x: 0.5, y: 0.84 })).toBe(true);
    expect(inCameraFrame({ x: 0.5, y: 1.15 })).toBe(false);
    expect(inCameraFrame({ x: -0.02, y: 0.4 })).toBe(false);
    expect(inCameraFrame(undefined)).toBe(false);
  });
});
