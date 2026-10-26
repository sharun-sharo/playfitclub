import { describe, expect, it } from "vitest";
import type { FramingLandmark } from "@/lib/vision/framing";
import {
  createPhoneCalibration,
  phoneBodyReading,
  phoneFramingGuidance,
  phoneFullBody,
  PHONE_ANKLES_NOT_REQUIRED,
  PHONE_CALIB_CONFIG,
  PHONE_LOSS_GRACE_MS,
  PHONE_PLAYER_READY,
  PHONE_STAGE_NOTE,
  PHONE_START_LANDMARKS,
  PHONE_VISIBILITY_FLOOR,
  requestPhoneStage,
  stepPhoneCalibration,
  type PhoneCalibSample,
  type PhoneCalibState,
} from "./phone-calibration";

function step(state: PhoneCalibState, sample: PhoneCalibSample) {
  return stepPhoneCalibration(state, sample, PHONE_CALIB_CONFIG);
}

function full(now: number): PhoneCalibSample {
  return { now, signal: "full", guidance: "Full Body Detected" };
}

function reachReady() {
  let state = createPhoneCalibration();
  state = step(state, full(0));
  state = step(state, full(2000));
  return state;
}

function reachGo() {
  let state = reachReady();
  state = step(state, full(2700));
  state = step(state, full(3700));
  state = step(state, full(4700));
  state = step(state, full(5700));
  return state;
}

function landmarks(visibility = 0.95): FramingLandmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }));
}

describe("phone calibration", () => {
  it("stays on Finding Player when no body is in frame", () => {
    let state = createPhoneCalibration();
    state = step(state, { now: 0, signal: "none" });
    state = step(state, { now: 5000, signal: "none" });
    expect(state.status).toBe("Finding Player");
    expect(state.phase).toBe("finding");
    expect(state.startCourse).toBe(false);
    expect(state.runStarted).toBe(false);
    expect(state.countdown).toBeNull();
  });

  it("becomes Ready only after a stable full body for 2 seconds", () => {
    let state = createPhoneCalibration();
    state = step(state, full(0));
    expect(state.status).toBe("Calibrating");
    expect(state.startCourse).toBe(false);
    state = step(state, full(1999));
    expect(state.status).toBe("Calibrating");
    expect(state.phase).not.toBe("ready");
    state = step(state, full(2000));
    expect(state.status).toBe("Ready");
    expect(state.phase).toBe("ready");
    expect(state.startCourse).toBe(false);
    expect(state.runStarted).toBe(false);
  });

  it("does not reset the 2 second hold for jitter inside the window", () => {
    let state = createPhoneCalibration();
    state = step(state, full(0));
    state = step(state, { now: 300, signal: "partial", guidance: "Stand Straight" });
    state = step(state, full(2000));
    expect(state.status).toBe("Ready");
    expect(state.holdStartedAt).toBe(0);
  });

  it("resets the hold when the body leaves", () => {
    let state = createPhoneCalibration();
    state = step(state, full(0));
    state = step(state, { now: 500, signal: "none" });
    expect(state.status).toBe("Finding Player");
    expect(state.holdStartedAt).toBeNull();
    state = step(state, full(500));
    state = step(state, full(2499));
    expect(state.status).toBe("Calibrating");
    state = step(state, full(2500));
    expect(state.status).toBe("Ready");
  });

  it("cancels the countdown when the body leaves and reaches GO only after 3, 2, 1", () => {
    let state = reachReady();
    state = step(state, full(2001));
    expect(state.phase).toBe("ready");
    expect(state.countdown).toBeNull();
    state = step(state, full(2700));
    expect(state.countdown).toBe("3");
    expect(state.phase).toBe("countdown");
    expect(state.startCourse).toBe(false);

    state = step(state, { now: 3000, signal: "none" });
    expect(state.countdown).toBeNull();
    expect(state.status).toBe("Finding Player");
    expect(state.phase).toBe("finding");
    expect(state.startCourse).toBe(false);
    expect(state.shown).toEqual([]);

    state = step(state, full(3000));
    state = step(state, full(5000));
    expect(state.status).toBe("Ready");
    state = step(state, full(5700));
    expect(state.countdown).toBe("3");
    state = step(state, full(9000));
    expect(state.countdown).toBe("2");
    expect(state.startCourse).toBe(false);
    state = step(state, full(10000));
    expect(state.countdown).toBe("1");
    state = step(state, full(11000));
    expect(state.countdown).toBe("GO");
    expect(state.shown).toEqual(["3", "2", "1", "GO"]);
    expect(state.startCourse).toBe(true);
    expect(state.resumeCourse).toBe(false);
    expect(state.runStarted).toBe(true);
    expect(PHONE_PLAYER_READY).toBe("PLAYER READY");
  });

  it("pauses after the existing loss grace, then resumes only through another countdown", () => {
    let state = reachGo();
    expect(state.phase).toBe("running");
    expect(PHONE_LOSS_GRACE_MS).toBe(3000);
    state = step(state, { now: 5800, signal: "none" });
    expect(state.phase).toBe("warning");
    expect(state.coursePaused).toBe(false);
    state = step(state, { now: 8799, signal: "none" });
    expect(state.phase).toBe("warning");
    expect(state.coursePaused).toBe(false);
    state = step(state, { now: 8800, signal: "none" });
    expect(state.phase).toBe("reposition");
    expect(state.coursePaused).toBe(true);
    expect(state.status).toBe("Finding Player");
    expect(state.runStarted).toBe(true);

    state = step(state, full(9000));
    state = step(state, full(11000));
    expect(state.status).toBe("Ready");
    expect(state.coursePaused).toBe(true);
    state = step(state, full(11700));
    state = step(state, full(12700));
    state = step(state, full(13700));
    state = step(state, full(14700));
    expect(state.countdown).toBe("GO");
    expect(state.resumeCourse).toBe(true);
    expect(state.startCourse).toBe(false);
    expect(state.coursePaused).toBe(false);
    expect(state.shown).toEqual(["3", "2", "1", "GO"]);
  });

  it("requires head, shoulders, hips, and knees, and does not require ankles", () => {
    expect(PHONE_VISIBILITY_FLOOR).toBe(0.45);
    expect(PHONE_START_LANDMARKS).toEqual({
      head: 0,
      leftShoulder: 11,
      rightShoulder: 12,
      leftHip: 23,
      rightHip: 24,
      leftKnee: 25,
      rightKnee: 26,
    });
    expect(PHONE_ANKLES_NOT_REQUIRED).toEqual([27, 28]);

    const body = landmarks();
    body[27] = { x: 0.46, y: 0.9, visibility: 0 };
    body[28] = { x: 0.54, y: 0.9, visibility: 0 };
    expect(phoneFullBody(body)).toBe(true);

    const hiddenKnee = landmarks();
    hiddenKnee[25] = { x: 0.46, y: 0.7, visibility: 0.2 };
    expect(phoneFullBody(hiddenKnee)).toBe(false);

    const noHead = landmarks();
    noHead[0] = { x: 0.5, y: 0.2, visibility: 0 };
    expect(phoneFullBody(noHead)).toBe(false);

    expect(phoneBodyReading({ poseCount: 0, landmarks: null, framingCode: null }).signal).toBe("none");
    expect(phoneBodyReading({ poseCount: 0, landmarks: null, framingCode: null }).guidance).toBeNull();
    const reading = phoneBodyReading({ poseCount: 1, landmarks: body, framingCode: "good" });
    expect(reading.signal).toBe("full");
    expect(reading.guidance).toBe("Full Body Detected");

    const covered = landmarks();
    covered[25] = { x: 0.47, y: 0.72, visibility: 0 };
    covered[26] = { x: 0.53, y: 0.72, visibility: 0 };
    const legs = phoneBodyReading({ poseCount: 1, landmarks: covered, framingCode: "good" });
    expect(legs.signal).toBe("partial");
    expect(legs.guidance).toBe("Stand Straight");
    expect(phoneFramingGuidance({ framingCode: "too_close", fullBody: true, straight: true, poseCount: 1 })).toBe("Move Back");
    expect(phoneFramingGuidance({ framingCode: "too_far", fullBody: false, straight: true, poseCount: 1 })).toBe("Move Closer");
    expect(phoneFramingGuidance({ framingCode: "move_left", fullBody: false, straight: true, poseCount: 1 })).toBe("Move Left");
    expect(phoneFramingGuidance({ framingCode: "move_right", fullBody: false, straight: true, poseCount: 1 })).toBe("Move Right");
    expect(phoneFramingGuidance({ framingCode: "keep_feet", fullBody: false, straight: true, poseCount: 1 })).toBe("Stand Straight");
    expect(phoneFramingGuidance({ framingCode: "good", fullBody: true, straight: true, poseCount: 2 })).toBeNull();
  });

  it("shows the sideways line only when fullscreen or orientation lock is missing or fails", async () => {
    await expect(requestPhoneStage({})).resolves.toEqual({
      fullscreen: false,
      orientationLocked: false,
      note: PHONE_STAGE_NOTE,
    });
    await expect(
      requestPhoneStage({
        fullscreen: async () => undefined,
        orientationLock: async () => {
          throw new Error("not allowed");
        },
      }),
    ).resolves.toMatchObject({ fullscreen: true, orientationLocked: false, note: PHONE_STAGE_NOTE });
    await expect(
      requestPhoneStage({
        fullscreen: async () => undefined,
        orientationLock: async (orientation) => {
          expect(orientation).toBe("landscape");
        },
      }),
    ).resolves.toEqual({ fullscreen: true, orientationLocked: true, note: null });
  });
});
