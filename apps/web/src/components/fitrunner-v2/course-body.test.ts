import { describe, expect, it } from "vitest";
import { COMMAND_SLICE_S, groundCourseBody, jumpDuringRoll, laneHitShift, laneSlideFraction, releaseStuckClip, remainingMotionDt, replayClip, SIDE_STEP_S, sideStepPose, sideStepTravel, verticalCommandReady } from "./course-body";
import { sampleJump } from "./jump-arc";

describe("course body after pause and play again", () => {
  it("drops an airborne jump and a waiting squat instead of playing them on resume", () => {
    const airborne = { motion: "jump" as const, jumpActive: true, buffered: true };
    expect(verticalCommandReady(airborne.motion)).toBe(false);
    expect(verticalCommandReady("roll")).toBe(false);
    expect(verticalCommandReady("fall")).toBe(false);

    const grounded = groundCourseBody();
    expect(grounded).toEqual({ motion: "run", jumpActive: false, buffered: false });
    expect(verticalCommandReady(grounded.motion)).toBe(true);
    expect(airborne.buffered).toBe(true);
    expect(grounded.buffered).toBe(false);
    expect(replayClip()).toEqual(grounded);
    expect(releaseStuckClip({ motion: "jump", jumpActive: false, elapsed: 1, motionEndsAt: Number.POSITIVE_INFINITY })).toBe("ground");
    expect(releaseStuckClip({ motion: "fall", jumpActive: false, elapsed: 1, motionEndsAt: Number.POSITIVE_INFINITY })).toBe("ground");
    expect(releaseStuckClip({ motion: "jump", jumpActive: true, elapsed: 0.1, motionEndsAt: Number.POSITIVE_INFINITY })).toBe("keep");
    expect(releaseStuckClip({ motion: "run", jumpActive: false, elapsed: 0, motionEndsAt: 0 })).toBe("keep");
  });

  it("starts a lane slide on the first slice and lets a jump cut through a duck", () => {
    const firstSlice = laneSlideFraction(16 / 100);
    const oldSmoothstep = (t: number) => t * t * (3 - 2 * t);
    expect(firstSlice).toBeGreaterThan(0.25);
    expect(oldSmoothstep(16 / 250)).toBeLessThan(0.02);
    expect(laneSlideFraction(0)).toBe(0);
    expect(laneSlideFraction(1)).toBe(1);
    const slice = sampleJump(COMMAND_SLICE_S);
    expect(slice.airborne).toBe(true);
    expect(slice.height).toBeGreaterThan(0.05);
    expect(slice.height).toBeLessThan(0.15);
    expect(laneSlideFraction(COMMAND_SLICE_S / SIDE_STEP_S)).toBeGreaterThan(0);
    expect(remainingMotionDt(0.02, COMMAND_SLICE_S)).toBeCloseTo(0.02 - COMMAND_SLICE_S, 5);
    expect(remainingMotionDt(0.01, COMMAND_SLICE_S)).toBe(0);
    expect(remainingMotionDt(0.016, 0)).toBeCloseTo(0.016, 5);
    expect(jumpDuringRoll("roll", "jump")).toBe(true);
    expect(jumpDuringRoll("roll", "squat")).toBe(false);
    expect(jumpDuringRoll("jump", "jump")).toBe(false);
    expect(verticalCommandReady("run")).toBe(true);
  });

  it("plays a procedural side-step because the runner clips have no strafe", () => {
    expect(SIDE_STEP_S).toBeGreaterThanOrEqual(0.25);
    expect(SIDE_STEP_S).toBeLessThanOrEqual(0.35);
    expect(sideStepTravel(0)).toBe(0);
    expect(sideStepTravel(1)).toBe(1);
    expect(sideStepTravel(0.16)).toBeGreaterThan(0.25);

    const start = sideStepPose(0, 1);
    const end = sideStepPose(1, -1);
    expect(start.torso).toBeCloseTo(0, 5);
    expect(start.leftHip).toBeCloseTo(0, 5);
    expect(start.rightFoot).toBeCloseTo(0, 5);
    expect(end.travel).toBe(1);
    expect(end.torso).toBeCloseTo(0, 5);
    expect(end.leftHip).toBeCloseTo(0, 5);
    expect(end.rightHip).toBeCloseTo(0, 5);
    expect(end.leftFoot).toBeCloseTo(0, 5);
    expect(end.rightFoot).toBeCloseTo(0, 5);

    const left = sideStepPose(0.28, -1);
    const right = sideStepPose(0.28, 1);
    expect(left.torso).toBeLessThan(-0.05);
    expect(right.torso).toBeGreaterThan(0.05);
    expect(left.rightHip).toBeGreaterThan(0.15);
    expect(right.leftHip).toBeLessThan(-0.15);
    expect(left.torso).toBeCloseTo(-right.torso, 5);

    expect(laneHitShift(1, 0, 3)).toBe(3);
    expect(laneHitShift(-1, 0, 3)).toBe(-3);
    expect(laneHitShift(1, 1, 3)).toBe(0);
    const arrived = sideStepTravel(1);
    expect(laneHitShift(1, arrived, 3)).toBe(0);
  });
});
