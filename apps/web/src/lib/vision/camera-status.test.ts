import { describe, expect, it } from "vitest";
import { CAMERA_LOST_MESSAGE, cameraStatusFromTrack, classifyCameraError } from "./camera-status";

describe("camera permission states", () => {
  it("maps a denied permission to a denied state", () => {
    const failure = classifyCameraError(new DOMException("no", "NotAllowedError"));
    expect(failure.status).toBe("denied");
    expect(failure.message).toMatch(/denied/i);
  });

  it("maps a missing camera to unavailable", () => {
    const failure = classifyCameraError(new DOMException("none", "NotFoundError"));
    expect(failure.status).toBe("unavailable");
    expect(failure.message).toMatch(/No camera/i);
  });

  it("maps an insecure page to unavailable", () => {
    const failure = classifyCameraError(new DOMException("blocked", "SecurityError"), false);
    expect(failure.status).toBe("unavailable");
    expect(failure.message).toMatch(/HTTPS/i);
  });

  it("treats an ended track as disconnected and leaves a live track granted", () => {
    expect(cameraStatusFromTrack({ readyState: "ended" })).toBe("disconnected");
    expect(cameraStatusFromTrack({ readyState: "live" })).toBe("granted");
    expect(CAMERA_LOST_MESSAGE).toMatch(/keyboard/i);
  });
});
