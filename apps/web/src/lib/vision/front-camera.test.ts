import { describe, expect, it } from "vitest";
import { frontCameraConstraints, frontCameraFallback } from "./front-camera";

describe("front camera constraints", () => {
  it("asks only for the selfie camera, in a portrait frame", () => {
    for (const video of [frontCameraConstraints(), frontCameraFallback()]) {
      expect(video.facingMode).toBe("user");
      expect(JSON.stringify(video)).not.toMatch(/environment/);
    }
    const video = frontCameraConstraints();
    const height = video.height as { ideal?: number };
    const width = video.width as { ideal?: number };
    expect(height.ideal).toBeGreaterThan(width.ideal ?? 0);
  });
});
