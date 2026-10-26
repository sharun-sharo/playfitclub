import { describe, expect, it } from "vitest";
import { medianStandingBaseline } from "./calibration";
import { DEFAULT_THRESHOLDS, type NeutralPose } from "./movement-types";
import {
  CALIBRATION_RETRY_MS,
  armMappingVerdict,
  calibrationThresholds,
  createMotionCalibration,
  noteBodyScale,
  observeMotionCalibration,
} from "./session-calibration";

function sample(state: ReturnType<typeof createMotionCalibration>, now: number, movement: "lean_left" | "lean_right" | "jump" | "squat" | null) {
  return observeMotionCalibration(state, {
    now,
    framingReady: true,
    movement,
    leftElevation: 140,
    rightElevation: 150,
    jumpVelocity: 0.8,
    squatDrop: 0.36,
  });
}

describe("session motion calibration", () => {
  it("stores body scale for this object only and then asks for each movement", () => {
    let state = createMotionCalibration(0);
    expect(state.instruction).toBeNull();
    state = noteBodyScale(state, 0.22, 0.16, 1000);
    expect(state.bodyScale).toEqual({ torso: 0.22, shoulderWidth: 0.16 });
    expect(state.instruction).toBe("Raise your left arm");
    state = sample(state, 1200, "lean_left");
    expect(state.step).toBe("right");
    expect(state.leftElevation).toBe(140);
    expect(state.instruction).toBe("Raise your right arm");
    state = sample(state, 1600, "lean_right");
    expect(state.instruction).toBe("Do a small jump");
    state = sample(state, 2000, "jump");
    expect(state.jumpVelocity).toBe(0.8);
    expect(state.instruction).toBe("Squat down");
    state = sample(state, 2800, "squat");
    expect(state.step).toBe("done");
    expect(state.instruction).toBeNull();
    expect(state.squatDrop).toBe(0.36);
    const fitted = calibrationThresholds(state);
    expect(fitted.squatEnterDrop).toBe(0.1);
    expect(fitted.squatEnterDrop).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.squatEnterDrop);
    expect(fitted.jumpRise).toBeUndefined();
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    expect(DEFAULT_THRESHOLDS.minActionConfidence).toBe(0.6);
  });

  it("retries the same step with a clearer line and does not require a tap", () => {
    let state = noteBodyScale(createMotionCalibration(0), 0.2, 0.16, 0);
    state = sample(state, CALIBRATION_RETRY_MS - 1, null);
    expect(state.step).toBe("left");
    expect(state.instruction).toBe("Raise your left arm");
    state = observeMotionCalibration(state, {
      now: CALIBRATION_RETRY_MS,
      framingReady: true,
      movement: null,
      leftElevation: 0,
      rightElevation: 0,
      jumpVelocity: 0,
      squatDrop: 0,
    });
    expect(state.step).toBe("left");
    expect(state.attempts).toBe(1);
    expect(state.instruction).toBe("Raise your left hand out, about chest height");
    state = sample(state, CALIBRATION_RETRY_MS + 400, "lean_left");
    expect(state.step).toBe("right");
  });

  it("pauses the retry clock while framing is lost and ignores the other side", () => {
    let state = noteBodyScale(createMotionCalibration(0), 0.2, 0.16, 0);
    state = observeMotionCalibration(state, {
      now: 10_000,
      framingReady: false,
      movement: null,
      leftElevation: 0,
      rightElevation: 0,
      jumpVelocity: 0,
      squatDrop: 0,
    });
    expect(state.attempts).toBe(0);
    expect(state.instruction).toBe("Raise your left arm");
    state = sample(state, 10_200, "lean_right");
    expect(state.step).toBe("left");
  });

  it("reports whether a raise matches the intended lane", () => {
    expect(armMappingVerdict("left", null)).toBe("waiting");
    expect(armMappingVerdict("left", "lean_left")).toBe("match");
    expect(armMappingVerdict("left", "lean_right")).toBe("mismatch");
    expect(armMappingVerdict("right", "lean_right")).toBe("match");
    expect(armMappingVerdict("right", "jump")).toBe("waiting");
  });

  it("uses the median standing pose and not the first frame alone", () => {
    const stance = (overrides: Partial<NeutralPose>): NeutralPose => ({
      centerX: 0.5,
      hipY: 0.5,
      shoulderY: 0.28,
      torso: 0.22,
      shoulderWidth: 0.16,
      ankleY: 0.9,
      kneeAngle: 175,
      thighLength: 0.2,
      shinLength: 0.2,
      leftWristLateral: 0.1,
      rightWristLateral: 0.1,
      shoulderHip: 0,
      legsMeasured: true,
      ...overrides,
    });
    const first = stance({ torso: 0.9, hipY: 0.1, shoulderWidth: 0.8, centerX: 0.1 });
    const steady = stance({});
    const median = medianStandingBaseline([
      first,
      steady,
      steady,
      stance({ torso: 0.24, hipY: 0.52, shoulderWidth: 0.17, centerX: 0.51 }),
      steady,
    ]);
    expect(median?.torso).toBeCloseTo(0.22);
    expect(median?.torso).not.toBe(first.torso);
    expect(median?.hipY).toBeCloseTo(0.5);
    expect(median?.hipY).not.toBe(first.hipY);
    expect(median?.shoulderWidth).toBeCloseTo(0.16);
    expect(median?.centerX).toBeCloseTo(0.5);
    expect(medianStandingBaseline([first])).toBeNull();
    expect(medianStandingBaseline([first, steady, steady, steady])).toBeNull();
  });
});