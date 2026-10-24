import { describe, expect, it } from "vitest";
import {
  classifyFraming,
  createFramingMonitor,
  FRAMING_DISTANCE_HINT,
  gestureBlocks,
  plainCalibrationCue,
  plainFramingCue,
  plainLimbCue,
  type FramingCode,
  type FramingLandmark,
  type FramingProfile,
  type FramingView,
} from "./framing";
import { createHandsFree, handsFreeCue, type HandsFreeSample } from "./hands-free";

function pose(mutate?: (points: FramingLandmark[]) => void): FramingLandmark[] {
  const points: FramingLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const set = (index: number, x: number, y: number, visibility = 0.95) => {
    points[index] = { x, y, visibility };
  };
  set(0, 0.5, 0.12);
  set(11, 0.42, 0.24);
  set(12, 0.58, 0.24);
  set(13, 0.36, 0.36);
  set(14, 0.64, 0.36);
  set(15, 0.32, 0.48);
  set(16, 0.68, 0.48);
  set(23, 0.44, 0.5);
  set(24, 0.56, 0.5);
  set(25, 0.45, 0.68);
  set(26, 0.55, 0.68);
  set(27, 0.46, 0.84);
  set(28, 0.54, 0.84);
  mutate?.(points);
  return points;
}

function shiftX(points: FramingLandmark[], delta: number) {
  return points.map((point) => ({ ...point, x: point.x + delta }));
}

function settle(landmarks: FramingLandmark[], profile: FramingProfile, mirrored: boolean, frames = 6) {
  const monitor = createFramingMonitor();
  let view!: FramingView;
  for (let index = 0; index < frames; index += 1) {
    view = monitor.push({ landmarks, mirrored, now: index * 33, profile });
  }
  return view;
}

describe("plain phone cues", () => {
  it("uses one short line from the framing code", () => {
    expect(plainFramingCue("too_close")).toBe("Move backward");
    expect(plainFramingCue("too_far")).toBe("Move closer");
    expect(plainFramingCue("keep_feet")).toBe("Keep your head and feet inside the frame.");
    expect(plainFramingCue("tilt_up")).toBe("Tilt phone upward");
    expect(plainFramingCue("tilt_down")).toBe("Tilt phone downward");
    expect(plainFramingCue("move_left")).toBe("Move slightly left");
    expect(plainFramingCue("move_right")).toBe("Move slightly right");
    expect(plainFramingCue("good")).toBe("Player detected");
    expect(plainFramingCue("adjust_camera", 0.2)).toBe("Improve lighting");
    expect(plainFramingCue("adjust_camera", 0.8)).toBe("Move back until your full body is visible.");
  });

  it("does not promise one distance for every phone", () => {
    expect(FRAMING_DISTANCE_HINT).toContain("Place your phone upright on a stable stand.");
    expect(FRAMING_DISTANCE_HINT).toContain("Move back until your full body is visible.");
    expect(FRAMING_DISTANCE_HINT).not.toMatch(/metres|meters|feet away/i);
  });

  it("asks the player to stand naturally once the body is framed", () => {
    expect(plainCalibrationCue("Hold still — too much movement to calibrate.", "good", 0.8)).toBe("Stand naturally");
    expect(plainCalibrationCue("Step back until both feet are visible.", "good", 0.8)).toBe("Show your feet");
    expect(plainLimbCue("LEFT ARM NOT IN FRAME")).toBe("Show your left arm");
  });
});

describe("framing classifier", () => {
  it("classifies a body clipped at the head and the feet as too close", () => {
    const landmarks = pose((points) => {
      points[0] = { x: 0.5, y: 0.01, visibility: 0.95 };
      points[27] = { x: 0.46, y: 0.99, visibility: 0.95 };
      points[28] = { x: 0.54, y: 0.99, visibility: 0.95 };
    });
    const view = settle(landmarks, "setup", true);
    expect(view.code).toBe("too_close");
    expect(view.instruction).toBe("STEP BACK A LITTLE");
    expect(view.tone).toBe("adjust");
  });

  it("accepts a small full body anywhere in the frame", () => {
    const landmarks = pose((points) => {
      points[0] = { x: 0.5, y: 0.4, visibility: 0.95 };
      points[11] = { x: 0.46, y: 0.44, visibility: 0.95 };
      points[12] = { x: 0.54, y: 0.44, visibility: 0.95 };
      points[15] = { x: 0.4, y: 0.5, visibility: 0.95 };
      points[16] = { x: 0.6, y: 0.5, visibility: 0.95 };
      points[23] = { x: 0.47, y: 0.5, visibility: 0.95 };
      points[24] = { x: 0.53, y: 0.5, visibility: 0.95 };
      points[25] = { x: 0.47, y: 0.56, visibility: 0.95 };
      points[26] = { x: 0.53, y: 0.56, visibility: 0.95 };
      points[27] = { x: 0.47, y: 0.62, visibility: 0.95 };
      points[28] = { x: 0.53, y: 0.62, visibility: 0.95 };
    });
    const view = settle(landmarks, "setup", true);
    expect(view.code).toBe("good");
    expect(view.instruction).toBe("Player detected");
  });

  it("accepts a full body on the left third, center, and right third", () => {
    for (const delta of [-0.22, 0, 0.22]) {
      const view = settle(shiftX(pose(), delta), "setup", true);
      expect(view.code).toBe("good");
    }
    const clipped = settle(shiftX(pose(), -0.4), "setup", true);
    expect(clipped.code).not.toBe("good");
  });

  it("asks for a step only when a joint is cut off at the edge", () => {
    const clippedOnRawLeft = settle(shiftX(pose(), -0.4), "setup", true);
    expect(clippedOnRawLeft.code).toBe("move_left");

    const unmirroredOnRawRight = settle(shiftX(pose(), 0.4), "setup", false);
    expect(unmirroredOnRawRight.code).toBe("move_right");
  });

  it("tilts down only when the feet are clipped and the head still has room", () => {
    const clipped = pose((points) => {
      points[0] = { x: 0.5, y: 0.16, visibility: 0.95 };
      points[27] = { x: 0.46, y: 0.99, visibility: 0.95 };
      points[28] = { x: 0.54, y: 0.99, visibility: 0.95 };
    });
    const view = settle(clipped, "setup", true);
    expect(view.code).toBe("tilt_down");
    expect(view.instruction).toBe("TILT YOUR PHONE DOWN");

    const missing = pose((points) => {
      points[27] = { x: 0.46, y: 0.84, visibility: 0 };
      points[28] = { x: 0.54, y: 0.84, visibility: 0 };
    });
    const hidden = settle(missing, "setup", true);
    expect(hidden.code).toBe("keep_feet");
    expect(hidden.instruction).toBe("KEEP YOUR FEET VISIBLE");
    expect(hidden.instruction).not.toMatch(/TILT/i);
  });

  it("does not treat a foot predicted outside the image as visible", () => {
    const outside = pose((points) => {
      points[27] = { x: 0.46, y: 1.2, visibility: 0.95 };
      points[28] = { x: 0.54, y: 1.2, visibility: 0.95 };
    });
    expect(settle(outside, "setup", true).code).toBe("keep_feet");

    const guessedHeel = pose((points) => {
      points[29] = { x: 0.46, y: 1.08, visibility: 0.9 };
      points[30] = { x: 0.54, y: 0.9, visibility: 0.2 };
    });
    expect(settle(guessedHeel, "setup", true).code).toBe("keep_feet");

    const quietHeel = pose((points) => {
      points[29] = { x: 0.46, y: 1.2, visibility: 0.1 };
    });
    expect(settle(quietHeel, "setup", true).code).toBe("good");
  });

  it("accepts a centered full body inside the height band", () => {
    const view = settle(pose(), "setup", true);
    expect(view.code).toBe("good");
    expect(view.tone).toBe("ready");
    expect(view.instruction).toBe("Player detected");
    expect(view.calibrate).toBe(false);
    const held = settle(pose(), "setup", true, 8);
    expect(held.calibrate).toBe(true);
  });

  it("does not flip a stable reading or pause on one noisy frame", () => {
    const monitor = createFramingMonitor();
    let now = 0;
    let view!: FramingView;
    for (let index = 0; index < 8; index += 1) {
      view = monitor.push({ landmarks: pose(), mirrored: true, now, profile: "play" });
      now += 33;
    }
    expect(view.code).toBe("good");
    const noisy = pose((points) => {
      points[0] = { x: 0.5, y: 0.02, visibility: 0.95 };
      points[27] = { x: 0.46, y: 0.99, visibility: 0.95 };
      points[28] = { x: 0.54, y: 0.99, visibility: 0.95 };
    });
    const dropped = monitor.push({ landmarks: noisy, mirrored: true, now, profile: "play" });
    expect(dropped.code).toBe("good");
    expect(dropped.banner).toBe(false);
    expect(dropped.pause).toBe(false);
    expect(dropped.suppressAll).toBe(false);

    const lost = pose((points) => {
      for (const point of points) point.visibility = 0;
    });
    let firstBad!: FramingView;
    for (let index = 0; index < 4; index += 1) {
      now += 40;
      const next = monitor.push({ landmarks: lost, mirrored: true, now, profile: "play" });
      if (index === 0) firstBad = next;
    }
    expect(firstBad.pause).toBe(false);
    expect(firstBad.banner).toBe(false);

    let bannerAt: number | null = null;
    let pauseAt: number | null = null;
    for (let index = 0; index < 80 && (bannerAt === null || pauseAt === null); index += 1) {
      now += 100;
      const next = monitor.push({ landmarks: lost, mirrored: true, now, profile: "play" });
      if (next.banner && bannerAt === null) bannerAt = now;
      if (next.pause && pauseAt === null) pauseAt = now;
    }
    expect(bannerAt).not.toBeNull();
    expect(pauseAt).not.toBeNull();
    expect(pauseAt! - bannerAt!).toBeGreaterThanOrEqual(500);
  });

  it("keeps an in-play squat inside the wider height band", () => {
    const squatting = pose((points) => {
      points[0] = { x: 0.5, y: 0.3, visibility: 0.95 };
      points[27] = { x: 0.46, y: 0.78, visibility: 0.95 };
      points[28] = { x: 0.54, y: 0.78, visibility: 0.95 };
    });
    expect(settle(squatting, "play", true).code).toBe("good");
    expect(settle(squatting, "setup", true).code).toBe("good");
  });

  it("names a missing arm, squat, or jump instead of dropping it", () => {
    const leftOut = pose((points) => {
      points[13] = { ...points[13], visibility: 0 };
    });
    const blocks = gestureBlocks(leftOut);
    expect(blocks.leftArm).toBe(true);
    expect(blocks.rightArm).toBe(false);
    expect(blocks.note).toBe("LEFT ARM NOT IN FRAME");

    const noKnees = pose((points) => {
      points[25] = { ...points[25], visibility: 0 };
      points[26] = { ...points[26], visibility: 0 };
    });
    expect(gestureBlocks(noKnees).note).toContain("SQUAT NEEDS HIPS AND KNEES");
    expect(gestureBlocks(noKnees).jump).toBe(false);
  });

  it("pauses a lost body only after the sustained interval, then waits for several good frames", () => {
    const monitor = createFramingMonitor();
    let now = 0;
    let view!: FramingView;
    for (let index = 0; index < 8; index += 1) {
      view = monitor.push({ landmarks: pose(), mirrored: true, now, profile: "play" });
      now += 33;
    }
    expect(view.pause).toBe(false);

    const lost = pose((points) => {
      for (const point of points) point.visibility = 0;
    });
    now += 40;
    view = monitor.push({ landmarks: lost, mirrored: true, now, profile: "play" });
    expect(view.pause).toBe(false);
    expect(view.canResume).toBe(false);

    for (let index = 0; index < 40; index += 1) {
      now += 100;
      view = monitor.push({ landmarks: lost, mirrored: true, now, profile: "play" });
    }
    expect(view.code).not.toBe("good");
    expect(view.pause).toBe(true);
    expect(view.canResume).toBe(false);
    expect(view.suppressAll).toBe(true);

    for (let index = 0; index < 4; index += 1) {
      now += 33;
      view = monitor.push({ landmarks: pose(), mirrored: true, now, profile: "play" });
      expect(view.pause).toBe(true);
      expect(view.canResume).toBe(false);
    }
    now += 33;
    view = monitor.push({ landmarks: pose(), mirrored: true, now, profile: "play" });
    expect(view.code).toBe("good");
    expect(view.pause).toBe(true);
    expect(view.canResume).toBe(true);

    monitor.resume();
    now += 33;
    view = monitor.push({ landmarks: pose(), mirrored: true, now, profile: "play" });
    expect(view.pause).toBe(false);
    expect(view.canResume).toBe(false);
    expect(view.suppressAll).toBe(false);
  });

  it("does not pause while framing is still in camera setup", () => {
    const monitor = createFramingMonitor();
    const lost = pose((points) => {
      for (const point of points) point.visibility = 0;
    });
    let now = 0;
    let view!: FramingView;
    for (let index = 0; index < 40; index += 1) {
      now += 100;
      view = monitor.push({ landmarks: lost, mirrored: true, now, profile: "setup" });
    }
    expect(view.pause).toBe(false);
    expect(view.banner).toBe(false);
    expect(view.canResume).toBe(false);
  });

  it("resets the calibration streak when a single frame leaves GOOD", () => {
    const monitor = createFramingMonitor();
    let view!: FramingView;
    for (let index = 0; index < 7; index += 1) {
      view = monitor.push({ landmarks: pose(), mirrored: true, now: index * 33, profile: "setup" });
    }
    expect(view.calibrate).toBe(false);
    view = monitor.push({ landmarks: pose(), mirrored: true, now: 7 * 33, profile: "setup" });
    expect(view.calibrate).toBe(true);
    const hiddenFeet = pose((points) => {
      points[27] = { x: 0.46, y: 0.84, visibility: 0 };
      points[28] = { x: 0.54, y: 0.84, visibility: 0 };
    });
    view = monitor.push({ landmarks: hiddenFeet, mirrored: true, now: 8 * 33, profile: "setup" });
    expect(view.calibrate).toBe(false);
  });
});

function lobbySample(code: FramingCode, confidence: number, now: number, poseCount = 1): HandsFreeSample {
  return {
    now,
    cameraGranted: true,
    sessionConnected: true,
    framingCode: code,
    confidence,
    poseCount,
    presenceConfidence: null,
    detectionConfidence: null,
    serverPhase: "lobby",
    serverCountdown: 0,
    countdownPurpose: null,
  };
}

describe("hands-free positioning", () => {
  it("waits a full 2 seconds of a good frame before ready, once", () => {
    const machine = createHandsFree();
    const good = classifyFraming(pose(), { mirrored: true, profile: "setup" });
    expect(good.code).toBe("good");
    expect(good.confidence).toBeGreaterThanOrEqual(0.6);
    let view = machine.push(lobbySample(good.code, good.confidence, 0));
    expect(view.phase).toBe("POSITIONING");
    expect(view.cue).toBe("Player detected");
    expect(view.sendReady).toBeNull();
    view = machine.push(lobbySample(good.code, good.confidence, 1999));
    expect(view.phase).toBe("POSITIONING");
    expect(view.sendReady).toBeNull();
    view = machine.push(lobbySample(good.code, good.confidence, 2000));
    expect(view.phase).toBe("READY");
    expect(view.sendReady).toBe(true);
    expect(view.secondPersonRuledOut).toBe(false);
    view = machine.push(lobbySample(good.code, good.confidence, 2500));
    expect(view.sendReady).toBeNull();
  });

  it("does not ready when the feet or the head are missing, or the body is clipped", () => {
    const feet = pose((points) => {
      points[27] = { x: 0.46, y: 0.84, visibility: 0 };
      points[28] = { x: 0.54, y: 0.84, visibility: 0 };
    });
    const head = pose((points) => {
      points[0] = { x: 0.5, y: 0.12, visibility: 0 };
    });
    const close = pose((points) => {
      points[0] = { x: 0.5, y: 0.01, visibility: 0.95 };
      points[27] = { x: 0.46, y: 0.99, visibility: 0.95 };
      points[28] = { x: 0.54, y: 0.99, visibility: 0.95 };
    });
    const cases = [
      { landmarks: feet, cue: "Keep Your Feet Visible" },
      { landmarks: head, cue: "Adjust Phone Angle" },
      { landmarks: close, cue: "Move Back" },
    ];
    for (const item of cases) {
      const framed = classifyFraming(item.landmarks, { mirrored: true, profile: "setup" });
      expect(handsFreeCue(framed.code, framed.confidence)).toBe(item.cue);
      const machine = createHandsFree();
      const view = machine.push(lobbySample(framed.code, Math.max(framed.confidence, 0.9), 5000));
      expect(view.phase).not.toBe("READY");
      expect(view.sendReady).toBeNull();
    }
  });

  it("refuses a second returned pose and an ambiguous confidence", () => {
    const machine = createHandsFree();
    const blocked = machine.push(lobbySample("good", 0.95, 5000, 2));
    expect(blocked.phase).not.toBe("READY");
    expect(blocked.secondPersonRuledOut).toBe(true);
    const dim = createHandsFree().push(lobbySample("good", 0.5, 5000, 1));
    expect(dim.phase).not.toBe("READY");
    expect(dim.sendReady).toBeNull();
    expect(dim.cue).toBe("Adjust Phone Angle");
  });
});
