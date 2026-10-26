import { describe, expect, it } from "vitest";
import type { FramingLandmark } from "@/lib/vision/framing";
import {
  createPhoneCalibration,
  phoneBodyReading,
  phoneFramingGuidance,
  phoneFullscreenKeepsPlay,
  phoneFullBody,
  PHONE_ANKLES_NOT_REQUIRED,
  PHONE_CALIB_CONFIG,
  PHONE_LOSS_GRACE_MS,
  PHONE_PLAYER_READY,
  PHONE_PLAY_STARTED_KEY,
  PHONE_STAGE_NOTE,
  PHONE_START_LANDMARKS,
  PHONE_VISIBILITY_FLOOR,
  readPhonePlayStarted,
  rememberPhonePlayStarted,
  requestPhoneFullscreen,
  requestPhoneStage,
  startPhonePlay,
  stepPhoneCalibration,
  type PhoneCalibSample,
  type PhoneCalibState,
} from "./phone-calibration";

function step(state: PhoneCalibState, sample: PhoneCalibSample) {
  return stepPhoneCalibration(state, sample, PHONE_CALIB_CONFIG);
}

function full(now: number): PhoneCalibSample {
  return { now, signal: "full", guidance: "Full body detected" };
}

function standing(mutate?: (points: FramingLandmark[]) => void): FramingLandmark[] {
  const points: FramingLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const set = (index: number, x: number, y: number, visibility = 0.95) => {
    points[index] = { x, y, visibility };
  };
  set(0, 0.5, 0.16);
  set(11, 0.42, 0.28);
  set(12, 0.58, 0.28);
  set(23, 0.44, 0.52);
  set(24, 0.56, 0.52);
  set(25, 0.45, 0.72);
  set(26, 0.55, 0.72);
  set(27, 0.46, 0.9, 0);
  set(28, 0.54, 0.9, 0);
  mutate?.(points);
  return points;
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
    state = step(state, { now: 300, signal: "partial", guidance: "Hold still" });
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
    const reading = phoneBodyReading({ poseCount: 1, landmarks: standing(), framingCode: "good" });
    expect(reading.signal).toBe("full");
    expect(reading.guidance).toBe("Full body detected");
    expect(reading.standing).toBe(true);

    const covered = standing((points) => {
      points[25] = { x: 0.45, y: 0.72, visibility: 0 };
      points[26] = { x: 0.55, y: 0.72, visibility: 0 };
    });
    const legs = phoneBodyReading({ poseCount: 1, landmarks: covered, framingCode: "good" });
    expect(legs.signal).toBe("partial");
    expect(legs.standing).toBe(false);
    expect(legs.guidance).toBe("Keep your knees visible");
    expect(phoneFramingGuidance({ framingCode: "too_close", fullBody: true, straight: true, poseCount: 1 })).toBe("Move farther");
    expect(phoneFramingGuidance({ framingCode: "too_far", fullBody: false, straight: true, poseCount: 1 })).toBe("Move closer");
    expect(phoneFramingGuidance({ framingCode: "move_left", fullBody: false, straight: true, poseCount: 1 })).toBe("Center your body");
    expect(phoneFramingGuidance({ framingCode: "move_right", fullBody: false, straight: true, poseCount: 1 })).toBe("Center your body");
    expect(phoneFramingGuidance({ framingCode: "keep_feet", fullBody: false, straight: true, poseCount: 1 })).toBe("Keep your knees visible");
    expect(phoneFramingGuidance({ framingCode: "good", fullBody: true, straight: true, poseCount: 2 })).toBeNull();
  });

  it("matches the on-screen line to the body measurement", () => {
    const centered = phoneBodyReading({ poseCount: 1, landmarks: standing(), framingCode: null });
    expect(centered.signal).toBe("full");
    expect(centered.guidance).toBe("Full body detected");

    const far = standing((points) => {
      points[0] = { x: 0.5, y: 0.46, visibility: 0.95 };
      points[11] = { x: 0.48, y: 0.48, visibility: 0.95 };
      points[12] = { x: 0.52, y: 0.48, visibility: 0.95 };
      points[23] = { x: 0.49, y: 0.52, visibility: 0.95 };
      points[24] = { x: 0.51, y: 0.52, visibility: 0.95 };
      points[25] = { x: 0.49, y: 0.56, visibility: 0.95 };
      points[26] = { x: 0.51, y: 0.56, visibility: 0.95 };
    });
    expect(phoneBodyReading({ poseCount: 1, landmarks: far, framingCode: "good" }).guidance).toBe("Move closer");

    const close = standing((points) => {
      points[0] = { x: 0.5, y: 0.02, visibility: 0.95 };
      points[11] = { x: 0.3, y: 0.12, visibility: 0.95 };
      points[12] = { x: 0.7, y: 0.12, visibility: 0.95 };
      points[23] = { x: 0.34, y: 0.62, visibility: 0.95 };
      points[24] = { x: 0.66, y: 0.62, visibility: 0.95 };
      points[25] = { x: 0.36, y: 0.97, visibility: 0.95 };
      points[26] = { x: 0.64, y: 0.97, visibility: 0.95 };
    });
    expect(phoneBodyReading({ poseCount: 1, landmarks: close, framingCode: "good" }).guidance).toBe("Move farther");

    const off = standing((points) => {
      for (const point of points) {
        if ((point.visibility ?? 0) > 0) point.x -= 0.22;
      }
    });
    expect(phoneBodyReading({ poseCount: 1, landmarks: off, framingCode: null }).guidance).toBe("Center your body");

    const dim = standing((points) => {
      for (const point of points) point.visibility = point.visibility ? 0.2 : 0;
    });
    expect(phoneBodyReading({ poseCount: 1, landmarks: dim, framingCode: null }).guidance).toBe("Improve lighting");
    expect(phoneBodyReading({ poseCount: 2, landmarks: standing(), framingCode: "good" }).signal).toBe("partial");
  });

  it("waits for the baseline after the 2 second hold and does not treat that wait as a reset", () => {
    let state = createPhoneCalibration();
    state = step(state, full(0));
    state = step(state, { ...full(2000), baselineReady: false });
    expect(state.status).toBe("Calibrating");
    expect(state.phase).toBe("calibrating");
    expect(state.machine).toBe("COLLECTING_BASELINE");
    expect(state.holdStartedAt).toBe(0);
    state = step(state, { ...full(2300), baselineReady: true });
    expect(state.status).toBe("Ready");
    expect(state.machine).toBe("CALIBRATED");
    expect(state.guidance).toBe("Full body detected");
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

  it("requests the camera and leaves the intro when orientation lock and fullscreen reject", async () => {
    const events: string[] = [];
    let releaseLock: () => void = () => undefined;
    const lock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const started = startPhonePlay({
      requestCamera: () => {
        events.push("camera");
        return Promise.resolve("front-camera");
      },
      stage: {
        fullscreen: async () => {
          events.push("fullscreen");
          throw new Error("fullscreen rejected");
        },
        orientationLock: () => {
          events.push("lock");
          return lock;
        },
      },
      onLeaveIntro: () => events.push("intro"),
    });
    expect(started.leftIntro).toBe(true);
    expect(events).toEqual(["intro", "camera", "fullscreen"]);
    await expect(started.camera).resolves.toBe("front-camera");
    expect(events).toEqual(["intro", "camera", "fullscreen", "lock"]);
    releaseLock();
    await lock;
    await Promise.resolve();
    expect(events).toEqual(["intro", "camera", "fullscreen", "lock"]);
  });

  it("leaves the intro when the camera throws before fullscreen and orientation lock reject", async () => {
    const events: string[] = [];
    const started = startPhonePlay({
      requestCamera: () => {
        events.push("camera");
        throw new Error("blocked");
      },
      stage: {
        fullscreen: async () => {
          events.push("fullscreen");
          throw new Error("fullscreen rejected");
        },
        orientationLock: async () => {
          events.push("lock");
          throw new Error("orientation rejected");
        },
      },
      onLeaveIntro: () => events.push("intro"),
      onStage: () => events.push("stage"),
    });
    expect(started.leftIntro).toBe(true);
    expect(events.slice(0, 3)).toEqual(["intro", "camera", "fullscreen"]);
    await expect(started.camera).rejects.toThrow("blocked");
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toContain("lock");
    expect(events).toContain("stage");
  });

  it("requests fullscreen on the game root in the play gesture and hides browser navigation", async () => {
    const calls: string[] = [];
    await requestPhoneFullscreen(
      {
        requestFullscreen: (options) => {
          calls.push(options?.navigationUI ?? "plain");
          return Promise.resolve();
        },
      },
      {
        requestFullscreen: () => {
          calls.push("document");
          return Promise.resolve();
        },
      },
    );
    expect(calls).toEqual(["hide"]);

    await requestPhoneFullscreen({
      webkitRequestFullscreen: () => {
        calls.push("webkit");
      },
    });
    expect(calls).toEqual(["hide", "webkit"]);

    await requestPhoneFullscreen(null, {
      requestFullscreen: (options) => {
        calls.push(`doc:${options?.navigationUI ?? "plain"}`);
        return Promise.resolve();
      },
    });
    expect(calls).toEqual(["hide", "webkit", "doc:hide"]);
  });

  it("retries fullscreen without navigation options when the browser rejects that object", async () => {
    const calls: string[] = [];
    await requestPhoneFullscreen({
      requestFullscreen: (options) => {
        calls.push(options?.navigationUI ?? "plain");
        if (options) throw new Error("options unsupported");
        return Promise.resolve();
      },
    });
    expect(calls).toEqual(["hide", "plain"]);
  });

  it("keeps a started phone session when fullscreen changes", () => {
    expect(phoneFullscreenKeepsPlay(true)).toBe(true);
    expect(phoneFullscreenKeepsPlay(false)).toBe(false);
  });

  it("remembers a started phone session for the next read", () => {
    const bag = new Map<string, string>();
    const storage = {
      getItem: (key: string) => bag.get(key) ?? null,
      setItem: (key: string, value: string) => {
        bag.set(key, value);
      },
    };
    expect(readPhonePlayStarted(storage)).toBe(false);
    rememberPhonePlayStarted(storage);
    expect(readPhonePlayStarted(storage)).toBe(true);
    expect(bag.get(PHONE_PLAY_STARTED_KEY)).toBe("1");
  });
});
