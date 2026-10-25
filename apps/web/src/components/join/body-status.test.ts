import { describe, expect, it } from "vitest";
import { CALIBRATION_HOLD } from "../../lib/vision/framing";
import { phoneBodyStatus, readinessInProgress } from "./body-status";

const setup = {
  joined: true,
  camera: "granted" as const,
  poseCount: 0,
  ready: false,
  liveRound: false,
  actionsEnabled: false,
  calibrated: false,
  readinessActive: false,
};

describe("phone body status", () => {
  it("follows the camera and the body the phone has actually reached", () => {
    expect(phoneBodyStatus({ ...setup, joined: false })).toBeNull();
    expect(phoneBodyStatus({ ...setup, camera: "off" })).toBe("connecting");
    expect(phoneBodyStatus({ ...setup, camera: "requesting" })).toBe("camera_starting");
    expect(phoneBodyStatus(setup)).toBe("searching");
    expect(phoneBodyStatus({ ...setup, poseCount: 1 })).toBe("body_detected");
    expect(phoneBodyStatus({ ...setup, poseCount: 1, readinessActive: true })).toBe("calibrating");
    expect(phoneBodyStatus({ ...setup, poseCount: 1, ready: true })).toBe("ready");
    expect(phoneBodyStatus({ ...setup, camera: "denied" })).toBe("camera_error");
    expect(phoneBodyStatus({ ...setup, camera: "disconnected", poseCount: 1, ready: true })).toBe("camera_error");
  });

  it("does not call a visible body calibration", () => {
    expect(
      readinessInProgress({
        calibrated: false,
        guidance: "Player detected",
        calibrationCue: null,
        framingCalibrate: false,
        handsPhase: "POSITIONING",
        handsCue: "Move Back",
        poseCount: 1,
      }),
    ).toBe(false);
    expect(
      readinessInProgress({
        calibrated: false,
        guidance: "Looking for player...",
        calibrationCue: null,
        framingCalibrate: false,
        handsPhase: "DETECTING_PLAYER",
        handsCue: "Looking for player...",
        poseCount: 0,
      }),
    ).toBe(false);
  });

  it("marks the existing hold and still-stance cues as calibration", () => {
    expect(
      readinessInProgress({
        calibrated: false,
        guidance: CALIBRATION_HOLD,
        calibrationCue: null,
        framingCalibrate: true,
        handsPhase: "POSITIONING",
        handsCue: "Player detected",
        poseCount: 1,
      }),
    ).toBe(true);
    expect(
      readinessInProgress({
        calibrated: false,
        guidance: "Hold still — too much movement to calibrate.",
        calibrationCue: null,
        framingCalibrate: false,
        handsPhase: "POSITIONING",
        handsCue: null,
        poseCount: 1,
      }),
    ).toBe(true);
    expect(
      readinessInProgress({
        calibrated: true,
        guidance: "Raise your left arm",
        calibrationCue: "Raise your left arm",
        framingCalibrate: false,
        handsPhase: "POSITIONING",
        handsCue: "Player detected",
        poseCount: 1,
      }),
    ).toBe(true);
  });

  it("keeps the live-round buckets once the server round has started", () => {
    expect(phoneBodyStatus({ ...setup, liveRound: true, actionsEnabled: true, ready: true })).toBe("tracking");
    expect(phoneBodyStatus({ ...setup, liveRound: true, calibrated: true })).toBe("ready");
    expect(phoneBodyStatus({ ...setup, liveRound: true })).toBe("calibrating");
  });
});
