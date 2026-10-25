import { describe, expect, it } from "vitest";
import { adaptThresholds, calibrateNeutral, neutralFromLandmarks } from "./calibration";
import { COMMAND_STALE_MS, holdCommand, releaseCommand } from "./command-buffer";
import { claimMovementId, createDetector, JUMP_RISE_DISPLACEMENT, JUMP_RISE_WINDOW_MS, MAX_VELOCITY_GAP_MS, neutralDriftForGap, peakUpwardTravel, pushPose, resetMovementReady, resetPhoneForRound, setNeutral, settleGestures, torsoLeanReleaseLine } from "./movement-state-machine";
import { DEFAULT_THRESHOLDS, type Landmark, type PoseFrame } from "./movement-types";

function landmark(x: number, y: number, visibility = 1): Landmark {
  return { x, y, visibility };
}

/** A front-view arm pump. The wrist stays near the shoulder instead of traveling outward. */
function indexSwing(time: number) {
  return time % 200 < 100 ? 0.05 : 0.14;
}

function pose(options: {
  cx?: number;
  hipDrop?: number;
  rise?: number;
  lean?: number;
  punch?: number;
  armsOut?: boolean;
  leftArm?: boolean;
  rightArm?: boolean;
  /** Outward wrist distance from the shoulder. Defaults to a full arm raise when leftArm or rightArm is set. */
  leftReach?: number;
  rightReach?: number;
  /** Elbow drop below the shoulder-wrist line, in normalized y. Larger is a more bent elbow. */
  leftBend?: number;
  rightBend?: number;
  /** Shoulder drop with the hips left in place. A bow, not a squat. */
  bow?: number;
  straightKnees?: boolean;
  /** Horizontal knee offset. Set this when a shallow dip must still bend the knees. */
  kneeForward?: number;
  leftOverhead?: boolean;
  rightOverhead?: boolean;
  /** Bent hand out at chest height. Not above the shoulder and not a straight arm. */
  leftHalfway?: boolean;
  rightHalfway?: boolean;
  /** Arm pointed sideways, elbow soft. */
  leftSideways?: boolean;
  rightSideways?: boolean;
  /** Arms pumping in front of the body. Not an outward raise. */
  runningArms?: boolean;
  /** Knees and ankles stay in the frame but under the visibility floor. */
  coverLegs?: boolean;
  /**
   * Shoulder-center shift in image x. Hips stay put.
   * Positive is image right. With the selfie mirror off, that is the player's right.
   */
  shoulderLean?: number;
  visibility?: number;
  hide?: number[];
  time: number;
}): PoseFrame {
  const cx = (options.cx ?? 0.5) + (options.lean ?? 0);
  const rise = options.rise ?? 0;
  const hipDrop = options.hipDrop ?? 0;
  const visibility = options.visibility ?? 1;
  const shoulderY = 0.3 - rise + (options.bow ?? 0);
  const hipY = 0.5 + hipDrop - rise;
  const kneeY = 0.68 + hipDrop * 0.45 - rise;
  const ankleY = 0.88 - rise * 0.6;
  const kneeForward = options.kneeForward ?? (options.straightKnees ? 0.01 : hipDrop > 0.05 ? 0.09 : 0.01);
  const points: Landmark[] = Array.from({ length: 33 }, () => landmark(cx, 0.5, 0.1));
  const set = (index: number, x: number, y: number) => {
    points[index] = landmark(x, y, visibility);
  };
  set(0, cx, shoulderY - 0.08);
  set(11, cx - 0.08, shoulderY);
  set(12, cx + 0.08, shoulderY);
  set(23, cx - 0.06, hipY);
  set(24, cx + 0.06, hipY);
  set(25, cx - 0.07 + kneeForward, kneeY);
  set(26, cx + 0.07 - kneeForward, kneeY);
  set(27, cx - 0.05, ankleY);
  set(28, cx + 0.05, ankleY);
  if (options.punch) {
    set(13, cx - 0.1, shoulderY + 0.03);
    set(15, cx - 0.11, shoulderY - options.punch);
    set(14, cx + 0.08, shoulderY + 0.06);
    set(16, cx + 0.08, shoulderY + 0.045);
  } else if (options.armsOut) {
    set(13, cx - 0.18, shoulderY);
    set(15, cx - 0.34, shoulderY);
    set(14, cx + 0.18, shoulderY);
    set(16, cx + 0.34, shoulderY);
  } else {
    set(13, cx - 0.1, shoulderY + 0.08);
    set(15, cx - 0.08, shoulderY + 0.16);
    set(14, cx + 0.1, shoulderY + 0.08);
    set(16, cx + 0.08, shoulderY + 0.16);
  }
  if (options.leftArm || options.leftReach !== undefined) {
    const reach = options.leftReach ?? 0.28;
    const bend = options.leftBend ?? 0.01;
    const shoulderX = cx - 0.08;
    set(13, shoulderX - reach * 0.5, shoulderY + bend);
    set(15, shoulderX - reach, shoulderY);
  }
  if (options.rightArm || options.rightReach !== undefined) {
    const reach = options.rightReach ?? 0.28;
    const bend = options.rightBend ?? 0.01;
    const shoulderX = cx + 0.08;
    set(14, shoulderX + reach * 0.5, shoulderY + bend);
    set(16, shoulderX + reach, shoulderY);
  }
  if (options.leftOverhead) {
    const shoulderX = cx - 0.08;
    set(13, shoulderX - 0.04, shoulderY - 0.1);
    set(15, shoulderX - 0.06, shoulderY - 0.2);
  }
  if (options.rightOverhead) {
    const shoulderX = cx + 0.08;
    set(14, shoulderX + 0.04, shoulderY - 0.1);
    set(16, shoulderX + 0.06, shoulderY - 0.2);
  }
  if (options.leftHalfway) {
    const shoulderX = cx - 0.08;
    set(13, shoulderX - 0.01, shoulderY + 0.1);
    set(15, shoulderX - 0.09, shoulderY + 0.1);
  }
  if (options.rightHalfway) {
    const shoulderX = cx + 0.08;
    set(14, shoulderX + 0.01, shoulderY + 0.1);
    set(16, shoulderX + 0.09, shoulderY + 0.1);
  }
  if (options.leftSideways) {
    const shoulderX = cx - 0.08;
    set(13, shoulderX - 0.1, shoulderY + 0.045);
    set(15, shoulderX - 0.2, shoulderY + 0.01);
  }
  if (options.rightSideways) {
    const shoulderX = cx + 0.08;
    set(14, shoulderX + 0.1, shoulderY + 0.045);
    set(16, shoulderX + 0.2, shoulderY + 0.01);
  }
  if (options.runningArms) {
    const lift = indexSwing(options.time);
    set(13, cx - 0.1, shoulderY + lift * 0.55);
    set(15, cx - 0.09, shoulderY + lift);
    set(14, cx + 0.1, shoulderY + (0.16 - lift) * 0.55);
    set(16, cx + 0.09, shoulderY + (0.16 - lift));
  }
  if (options.shoulderLean) {
    for (const index of [11, 12]) {
      const point = points[index];
      if (point) points[index] = { ...point, x: point.x + options.shoulderLean };
    }
  }
  for (const index of options.hide ?? []) points[index] = null as unknown as Landmark;
  if (options.coverLegs) {
    for (const index of [25, 26, 27, 28]) {
      const point = points[index];
      if (point) points[index] = { ...point, visibility: 0.2 };
    }
  }
  return { timestampMs: options.time, landmarks: points };
}

function feed(times: number, build: (index: number) => PoseFrame, mirror = false) {
  let state = createDetector({ mirror, smoothingAlpha: 1, cooldownMs: 200 });
  const neutralFrame = pose({ time: 0 });
  const neutral = neutralFromLandmarks(neutralFrame.landmarks);
  if (!neutral) throw new Error("Failed to build a neutral pose");
  state = setNeutral(state, neutral);
  const events = [];
  for (let index = 0; index < times; index += 1) {
    const update = pushPose(state, build(index));
    state = update.state;
    events.push(...update.events);
  }
  return { state, events };
}

describe("movement detection", () => {
  it("emits one squat after a descent and requires standing before another", () => {
    const { events } = feed(24, (index) => {
      const cycle = index < 12 ? index : index - 12;
      const hipDrop = cycle < 3 ? 0 : cycle < 8 ? 0.16 : 0;
      return pose({ time: index * 80, hipDrop });
    });
    const squats = events.filter((event) => event.movementType === "squat");
    expect(squats).toHaveLength(2);
    expect(squats[0]?.sequenceNumber).toBeLessThan(squats[1]?.sequenceNumber ?? 0);
  });

  it("does not emit a second squat while the player holds the bottom position", () => {
    const { events } = feed(20, (index) => pose({ time: index * 50, hipDrop: index < 2 ? 0 : 0.18 }));
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(1);
  });

  it("does not treat a torso lean as a lane command", () => {
    const left = feed(6, (index) => pose({ time: index * 80, lean: index < 2 ? 0 : -0.14 }));
    expect(left.events).toHaveLength(0);
    const right = feed(6, (index) => pose({ time: index * 80, lean: index < 2 ? 0 : 0.14 }));
    expect(right.events).toHaveLength(0);
  });

  it("estimates a jump from a fast rise and ankle lift", () => {
    const { events } = feed(8, (index) => pose({ time: index * 80, rise: index < 3 ? 0 : 0.1 }));
    expect(events.map((event) => event.movementType)).toContain("jump");
    const jumps = events.filter((event) => event.movementType === "jump");
    expect(jumps).toHaveLength(1);
  });

  it("rejects low-confidence and missing landmarks", () => {
    const low = feed(8, (index) => pose({ time: index * 80, hipDrop: 0.18, visibility: 0.2 }));
    expect(low.events).toHaveLength(0);
    const missing = feed(8, (index) => pose({ time: index * 80, hipDrop: 0.18, hide: [23, 24] }));
    expect(missing.events).toHaveLength(0);
  });

  it("ignores jitter that never crosses the lean threshold", () => {
    const { events } = feed(30, (index) => pose({ time: index * 40, lean: index % 2 === 0 ? -0.05 : -0.07 }));
    expect(events.filter((event) => event.movementType.startsWith("lean"))).toHaveLength(0);
  });

  it("calibrates an off-center neutral stance and measures leans relative to it", () => {
    const frames = Array.from({ length: 8 }, (_, index) => pose({ time: index * 50, cx: 0.62 }));
    const calibrated = calibrateNeutral(frames, 0.55);
    expect(calibrated.stable).toBe(true);
    expect(calibrated.neutral?.centerX).toBeGreaterThan(0.6);

    let state = createDetector({ mirror: false, smoothingAlpha: 1 });
    state = setNeutral(state, calibrated.neutral!);
    const settled = pushPose(state, pose({ time: 1000, cx: 0.62 }));
    expect(settled.events).toHaveLength(0);
    let armed = settled.state;
    const raised = [];
    for (let index = 0; index < 4; index += 1) {
      const update = pushPose(armed, pose({ time: 1100 + index * 80, cx: 0.62, leftArm: true }));
      armed = update.state;
      raised.push(...update.events);
    }
    expect(raised.map((event) => event.movementType)).toContain("lean_left");
    expect(raised.map((event) => event.movementType)).not.toContain("lean_right");
  });

  it("does not emit a punch or a two-arm hold", () => {
    const punch = feed(6, (index) => pose({ time: index * 80, punch: index < 2 ? 0 : 0.18 }));
    expect(punch.events.map((event) => event.movementType)).not.toContain("punch");
    expect(punch.events.map((event) => event.movementType)).not.toContain("hold");

    const held = feed(10, (index) => pose({ time: index * 120, armsOut: true }));
    expect(held.events).toHaveLength(0);
    expect(held.state.lastReject?.reason).toBe("both_arms");
  });

  it("does not emit left or right for noisy lean inside the neutral zone", () => {
    const { events } = feed(28, (index) => pose({ time: index * 33, lean: index % 2 === 0 ? -0.04 : 0.035 }));
    expect(events.filter((event) => event.movementType === "lean_left" || event.movementType === "lean_right")).toHaveLength(0);
    expect(DEFAULT_THRESHOLDS.leanEnter).toBeGreaterThan(DEFAULT_THRESHOLDS.leanExit);
  });

  it("emits one jump for a single upward move and none for the landing", () => {
    const { events } = feed(14, (index) => pose({ time: index * 50, rise: index === 3 ? 0.11 : 0 }));
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(1);
  });

  it("emits one duck while the squat is held and another only after release", () => {
    let state = createDetector({ mirror: false, smoothingAlpha: 1 });
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    state = setNeutral(state, neutral);
    const script = [
      { time: 0, hipDrop: 0 },
      { time: 80, hipDrop: 0 },
      { time: 160, hipDrop: 0.2 },
      { time: 240, hipDrop: 0.2 },
      { time: 320, hipDrop: 0.2 },
      { time: 400, hipDrop: 0.2 },
      { time: 520, hipDrop: 0 },
      { time: 760, hipDrop: 0 },
      { time: 920, hipDrop: 0.2 },
      { time: 1000, hipDrop: 0.2 },
      { time: 1080, hipDrop: 0.2 },
      { time: 1160, hipDrop: 0.2 },
    ];
    const ducks = [];
    const jumps = [];
    for (const frame of script) {
      const update = pushPose(state, pose(frame));
      state = update.state;
      ducks.push(...update.events.filter((event) => event.movementType === "squat"));
      jumps.push(...update.events.filter((event) => event.movementType === "jump"));
    }
    expect(jumps).toHaveLength(0);
    expect(ducks).toHaveLength(2);
    const gap = (ducks[1]?.clientTimestamp ?? 0) - (ducks[0]?.clientTimestamp ?? 0);
    expect(gap).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.cooldownMs);
    console.log(JSON.stringify({
      cooldownMs: DEFAULT_THRESHOLDS.cooldownMs,
      observedDuckGapMs: gap,
      minActionConfidence: DEFAULT_THRESHOLDS.minActionConfidence,
      smoothingAlpha: DEFAULT_THRESHOLDS.smoothingAlpha,
    }));
  });

  it("emits a clear raise on the smoothed frame that is already past the line", () => {
    let state = createDetector({ mirror: false });
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    state = setNeutral(state, neutral);
    const frameMs = 33;
    const stepAt = 8 * frameMs;
    let emittedAt: number | null = null;
    for (let index = 0; index < 24; index += 1) {
      const time = index * frameMs;
      const update = pushPose(state, pose({ time, leftReach: time >= stepAt ? 0.16 : 0 }));
      state = update.state;
      const lean = update.events.find((event) => event.movementType === "lean_left" || event.movementType === "lean_right");
      if (lean && emittedAt === null) emittedAt = lean.clientTimestamp;
    }
    expect(emittedAt).not.toBeNull();
    const smoothingLatencyMs = (emittedAt ?? stepAt) - stepAt;
    expect(smoothingLatencyMs).toBe(0);
    expect(smoothingLatencyMs).toBeLessThan(70);
    console.log(JSON.stringify({ smoothingLatencyMs, smoothingAlpha: DEFAULT_THRESHOLDS.smoothingAlpha, frameMs, armHoldMs: DEFAULT_THRESHOLDS.armHoldMs }));
  });

  it("does not emit a large lean when confidence stays under the action threshold", () => {
    const { events } = feed(8, (index) => pose({ time: index * 80, lean: index < 2 ? 0 : -0.16, visibility: 0.5 }));
    expect(events).toHaveLength(0);
    expect(0.5).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.minVisibility);
    expect(0.5).toBeLessThan(DEFAULT_THRESHOLDS.minActionConfidence);
  });
});

describe("phone camera gestures", () => {
  it("sends one LEFT command for a one-shot anatomical left arm raise", () => {
    const { events, state } = feed(8, (index) => pose({ time: index * 80, leftArm: index >= 2 }));
    const left = events.filter((event) => event.movementType === "lean_left");
    expect(left).toHaveLength(1);
    expect(events.map((event) => event.movementType)).not.toContain("lean_right");
    expect(state.phase).toBe("LEFT_ARM_ACTIVE");
    expect(left[0]?.sequenceNumber).toBeGreaterThan(0);
  });

  it("sends one RIGHT command for a one-shot anatomical right arm raise", () => {
    const { events, state } = feed(8, (index) => pose({ time: index * 80, rightArm: index >= 2 }));
    expect(events.filter((event) => event.movementType === "lean_right")).toHaveLength(1);
    expect(events.map((event) => event.movementType)).not.toContain("lean_left");
    expect(state.phase).toBe("RIGHT_ARM_ACTIVE");
  });

  it("does not repeat LEFT while the left arm stays raised", () => {
    const { events } = feed(18, (index) => pose({ time: index * 60, leftArm: index >= 1 }));
    expect(events.filter((event) => event.movementType === "lean_left")).toHaveLength(1);
  });

  it("does not repeat RIGHT while the right arm stays raised", () => {
    const { events } = feed(18, (index) => pose({ time: index * 60, rightArm: index >= 1 }));
    expect(events.filter((event) => event.movementType === "lean_right")).toHaveLength(1);
  });

  it("re-arms LEFT only after the wrist drops below the reset threshold", () => {
    const { events } = feed(24, (index) => {
      const raised = index >= 2 && index < 7;
      const half = index >= 7 && index < 12;
      const again = index >= 16;
      return pose({
        time: index * 80,
        leftArm: raised || again,
        leftReach: half ? 0.1 : undefined,
      });
    });
    expect(events.filter((event) => event.movementType === "lean_left")).toHaveLength(2);
    expect(events.filter((event) => event.movementType === "lean_right")).toHaveLength(0);
  });

  it("re-arms RIGHT only after the wrist drops below the reset threshold", () => {
    const { events } = feed(24, (index) => {
      const raised = index >= 2 && index < 7;
      const half = index >= 7 && index < 12;
      const again = index >= 16;
      return pose({
        time: index * 80,
        rightArm: raised || again,
        rightReach: half ? 0.1 : undefined,
      });
    });
    expect(events.filter((event) => event.movementType === "lean_right")).toHaveLength(2);
  });

  it("sends one squat per lowering and another only after returning toward stand", () => {
    const { events } = feed(16, (index) => {
      const lowered = (index >= 2 && index < 6) || index >= 12;
      return pose({ time: index * 80, hipDrop: lowered ? 0.18 : 0 });
    });
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(2);
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(0);
  });

  it("sends one jump for a hip-and-ankle rise and none while landing", () => {
    const { events } = feed(14, (index) => pose({ time: index * 50, rise: index === 3 ? 0.11 : 0 }));
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(1);
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
  });

  it("emits once for each one-frame arm that is already up", () => {
    const { events } = feed(12, (index) => pose({ time: index * 40, leftArm: index === 4, rightArm: index === 8 }));
    expect(events.map((event) => event.movementType)).toEqual(["lean_left", "lean_right"]);
    expect(events[0]?.clientTimestamp).toBe(4 * 40);
    expect(events[1]?.clientTimestamp).toBe(8 * 40);
  });

  it("does not trigger while the player stands still", () => {
    const { events, state } = feed(16, (index) => pose({ time: index * 50 }));
    expect(events).toHaveLength(0);
    expect(state.phase).toBe("NEUTRAL");
  });

  it("does not trigger an arm raise when confidence stays under the action threshold", () => {
    const { events, state } = feed(10, (index) => pose({ time: index * 80, leftArm: index >= 2, visibility: 0.5 }));
    expect(events).toHaveLength(0);
    expect(state.lastReject?.reason).toBe("low_confidence");
  });

  it("maps the anatomical left arm to move-left after a mirrored selfie frame", () => {
    const mirrored = feed(8, (index) => pose({ time: index * 80, leftArm: index >= 2 }), true);
    expect(mirrored.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    const right = feed(8, (index) => pose({ time: index * 80, rightArm: index >= 2 }), true);
    expect(right.events.map((event) => event.movementType)).toEqual(["lean_right"]);
  });

  it("rejects both arms and does not fire the arm that stays up", () => {
    const { events, state } = feed(16, (index) =>
      pose({
        time: index * 70,
        armsOut: index >= 2 && index < 8,
        leftArm: index >= 8,
      }),
    );
    expect(events).toHaveLength(0);
    expect(state.lastReject?.reason).toBe("both_arms");
    expect(state.phase).not.toBe("LEFT_ARM_ACTIVE");
  });

  it("counts one command per gesture cycle", () => {
    const { events } = feed(14, (index) => pose({ time: index * 50, leftArm: index >= 2 }));
    const left = events.filter((event) => event.movementType === "lean_left");
    expect(left).toHaveLength(1);
    expect(new Set(events.map((event) => event.sequenceNumber)).size).toBe(events.length);
    expect(events.filter((event) => event.movementType === "jump" || event.movementType === "squat")).toHaveLength(0);
  });

  it("does not turn standing up from a squat into a jump", () => {
    const { events } = feed(12, (index) => pose({ time: index * 60, hipDrop: index >= 2 && index < 7 ? 0.2 : 0 }));
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(1);
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(0);
  });

  it("treats a brief hip drop and rapid rise as one jump", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    const { events } = feed(12, (index) => {
      const dip = index === 3;
      const hop = index === 4 || index === 5;
      return pose({ time: index * 33, hipDrop: dip ? 0.08 : 0, rise: hop ? 0.08 : 0 });
    });
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(1);
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
    expect(events.map((event) => event.movementType)).toEqual(["jump"]);
  });

  it("emits one squat when a hip drop is held past the confirm window", () => {
    const { events } = feed(14, (index) => pose({ time: index * 40, hipDrop: index >= 2 ? 0.1 : 0 }));
    const squats = events.filter((event) => event.movementType === "squat");
    expect(squats).toHaveLength(1);
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(0);
    expect((squats[0]?.clientTimestamp ?? 0) - 2 * 40).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.squatHoldMs);
  });

  it("emits one squat for a deep squat and none for standing back up", () => {
    const { events } = feed(16, (index) => pose({ time: index * 50, hipDrop: index >= 2 && index < 10 ? 0.22 : 0 }));
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(1);
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(0);
  });

  it("emits one jump when the hips rise without a dip", () => {
    const { events } = feed(10, (index) => pose({ time: index * 50, rise: index === 3 ? 0.08 : 0 }));
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(1);
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
  });

  it("accepts a chest-height bent raise and a soft sideways point, and ignores a small drift", () => {
    const halfway = feed(8, (index) => pose({ time: index * 80, leftHalfway: index >= 2 }));
    expect(halfway.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    expect(DEFAULT_THRESHOLDS.elbowEnter).toBe(122);
    expect(DEFAULT_THRESHOLDS.halfwayElbowMin).toBeLessThan(DEFAULT_THRESHOLDS.elbowEnter);
    expect(DEFAULT_THRESHOLDS.sidewaysElbowEnter).toBeLessThan(DEFAULT_THRESHOLDS.elbowEnter);

    const sideways = feed(8, (index) => pose({ time: index * 80, leftSideways: index >= 2 }));
    expect(sideways.events.map((event) => event.movementType)).toEqual(["lean_left"]);

    const drift = feed(10, (index) => pose({ time: index * 80, leftReach: index >= 2 ? 0.08 : undefined }));
    expect(drift.events).toHaveLength(0);

    const folded = feed(8, (index) =>
      pose({ time: index * 80, leftReach: index >= 2 ? 0.16 : undefined, leftBend: index >= 2 ? 0.07 : undefined }),
    );
    expect(folded.events).toHaveLength(0);
  });

  it("keeps anatomical left and right after a mirrored selfie frame for a bent raise", () => {
    const left = feed(8, (index) => pose({ time: index * 80, leftHalfway: index >= 2 }), true);
    expect(left.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    const right = feed(8, (index) => pose({ time: index * 80, rightHalfway: index >= 2 }), true);
    expect(right.events.map((event) => event.movementType)).toEqual(["lean_right"]);
  });

  it("sends left and then right after the first arm resets, inside the old shared cooldown", () => {
    const { events } = feed(14, (index) =>
      pose({
        time: index * 40,
        leftArm: index >= 1 && index < 5,
        rightArm: index >= 6,
      }),
    );
    const types = events.map((event) => event.movementType);
    expect(types).toEqual(["lean_left", "lean_right"]);
    const gap = (events[1]?.clientTimestamp ?? 0) - (events[0]?.clientTimestamp ?? 0);
    expect(gap).toBeLessThan(DEFAULT_THRESHOLDS.cooldownMs);
    expect(events[0]?.eventId).not.toBe(events[1]?.eventId);
  });

  it("rejects a forward bend and accepts a partial squat from the calibrated stance", () => {
    const bow = feed(8, (index) => pose({ time: index * 80, bow: index >= 2 ? 0.14 : 0, straightKnees: true }));
    expect(bow.events).toHaveLength(0);
    expect(bow.state.lastReject?.reason).toBe("forward_bend");

    const partial = feed(8, (index) => pose({ time: index * 80, hipDrop: index >= 2 ? 0.08 : 0 }));
    expect(partial.events.map((event) => event.movementType)).toEqual(["squat"]);
    expect(partial.events.filter((event) => event.movementType === "jump")).toHaveLength(0);
  });

  it("starts a small hop once and does not turn standing up from a squat into a hop", () => {
    const hop = feed(8, (index) => pose({ time: index * 50, rise: index === 3 ? 0.035 : 0 }));
    expect(hop.events.map((event) => event.movementType)).toEqual(["jump"]);

    const jitter = feed(10, (index) => pose({ time: index * 40, rise: index % 2 === 0 ? 0.004 : 0 }));
    expect(jitter.events.filter((event) => event.movementType === "jump")).toHaveLength(0);

    const stand = feed(12, (index) => pose({ time: index * 60, hipDrop: index >= 2 && index < 7 ? 0.2 : 0 }));
    expect(stand.events.filter((event) => event.movementType === "squat")).toHaveLength(1);
    expect(stand.events.filter((event) => event.movementType === "jump")).toHaveLength(0);
  });

  it("keeps an arm candidate across one missing frame and drops it after a long gap", () => {
    const flicker = feed(8, (index) =>
      pose({
        time: index * 50,
        leftArm: index === 2 || index === 4 || index === 5,
        hide: index === 3 ? [11, 12, 23, 24, 27, 28] : [],
      }),
    );
    expect(flicker.events.filter((event) => event.movementType === "lean_left")).toHaveLength(1);

    const ankles = feed(8, (index) => pose({ time: index * 50, leftArm: index >= 2, hide: index === 3 ? [27, 28] : [] }));
    expect(ankles.events.filter((event) => event.movementType === "lean_left")).toHaveLength(1);
    expect(ankles.events.filter((event) => event.movementType === "squat" || event.movementType === "jump")).toHaveLength(0);

    const hole = feed(18, (index) =>
      pose({
        time: index * 40,
        leftArm: index === 2 || index >= 13,
        hide: index >= 4 && index < 13 ? [11, 12, 23, 24] : [],
      }),
    );
    const left = hole.events.filter((event) => event.movementType === "lean_left");
    expect(left).toHaveLength(2);
    expect(left[0]?.clientTimestamp).toBe(2 * 40);
    expect(left[1]?.clientTimestamp).toBeGreaterThanOrEqual(13 * 40);
  });

  it("gives each confirmed gesture one id and rejects a duplicate id", () => {
    const { events } = feed(20, (index) => pose({ time: index * 80, leftArm: (index >= 2 && index < 6) || index >= 12 }));
    const left = events.filter((event) => event.movementType === "lean_left");
    expect(left).toHaveLength(2);
    expect(new Set(left.map((event) => event.eventId)).size).toBe(2);
    const seen = new Set<string>();
    expect(left.every((event) => claimMovementId(seen, event.eventId))).toBe(true);
    expect(claimMovementId(seen, left[0]?.eventId ?? "")).toBe(false);
  });

  it("adapts the squat knee gate to the calibrated stance inside safe bounds", () => {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    const upright = { ...neutral, kneeAngle: 176 };
    const adapted = adaptThresholds(upright, DEFAULT_THRESHOLDS);
    expect(adapted.squatKneeEnter).toBeLessThan(upright.kneeAngle);
    expect(adapted.squatKneeEnter).toBeGreaterThanOrEqual(142);
    expect(adapted.squatKneeEnter).toBeLessThanOrEqual(156);
    expect(adapted.squatKneeExit ?? 0).toBeGreaterThan(adapted.squatKneeEnter ?? 0);

    const soft = adaptThresholds({ ...neutral, kneeAngle: 150 }, DEFAULT_THRESHOLDS);
    expect(soft.squatKneeEnter).toBeGreaterThanOrEqual(142);
    expect(soft.squatKneeEnter).toBeLessThan(150);
  });

  it("holds one command until the runner is free and drops it when it is stale", () => {
    let held = holdCommand(null, { id: "mv-left-1" }, 1_000);
    let step = releaseCommand(held, 1_200, COMMAND_STALE_MS, false);
    expect(step.apply).toBeNull();
    expect(step.dropped).toBeNull();
    step = releaseCommand(step.held, 1_300, COMMAND_STALE_MS, true);
    expect(step.apply).toEqual({ id: "mv-left-1" });

    held = holdCommand(null, { id: "mv-old" }, 1_000);
    held = holdCommand(held, { id: "mv-new" }, 1_100);
    step = releaseCommand(held, 1_100 + COMMAND_STALE_MS + 1, COMMAND_STALE_MS, true);
    expect(step.dropped).toBe("stale");
    expect(step.apply).toBeNull();
    expect(COMMAND_STALE_MS).toBe(800);
  });

  it("keeps a command that is still inside the jump arc and drops one past the stale bound", () => {
    const received = 10_000;
    const arcMs = 622;
    const oldBound = releaseCommand(holdCommand(null, { id: "squat-during-jump" }, received), received + arcMs, 400, false);
    expect(oldBound.dropped).toBe("stale");
    expect(oldBound.apply).toBeNull();

    const kept = releaseCommand(holdCommand(null, { id: "squat-during-jump" }, received), received + arcMs, COMMAND_STALE_MS, true);
    expect(kept.dropped).toBeNull();
    expect(kept.apply).toEqual({ id: "squat-during-jump" });

    const fresh = releaseCommand(holdCommand(null, { id: "fresh" }, received), received + 200, COMMAND_STALE_MS, true);
    expect(fresh.apply).toEqual({ id: "fresh" });
    expect(fresh.dropped).toBeNull();

    const expired = releaseCommand(holdCommand(null, { id: "old" }, received), received + COMMAND_STALE_MS + 1, COMMAND_STALE_MS, true);
    expect(expired.dropped).toBe("stale");
    expect(expired.apply).toBeNull();
  });

  it("emits nothing when tracking is lost", () => {
    const lost = feed(8, (index) => pose({ time: index * 80, leftArm: true, hipDrop: 0.2, hide: [23, 24] }));
    expect(lost.events).toHaveLength(0);
    expect(lost.state.lastReject?.reason).toBe("tracking_lost");

    const interrupted = feed(12, (index) =>
      pose({ time: index * 70, leftArm: index >= 2, hide: index >= 6 ? [11, 23, 27] : [] }),
    );
    expect(interrupted.events.filter((event) => event.movementType === "lean_left")).toHaveLength(1);
  });

  it("ignores the pose in flight when tracking returns, then accepts the next movement", () => {
    let state = createDetector({ mirror: false, smoothingAlpha: 1, cooldownMs: 0 });
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    state = setNeutral(state, neutral);
    for (let index = 0; index < 8; index += 1) {
      state = pushPose(state, pose({ time: 200 + index * 40, leftArm: true })).state;
    }
    expect(state.left.phase).not.toBe("NEUTRAL");

    state = settleGestures(state);
    expect(state.phase).toBe("NEUTRAL");
    expect(state.left.phase).toBe("NEUTRAL");
    expect(state.right.phase).toBe("NEUTRAL");
    expect(state.squat.phase).toBe("NEUTRAL");
    expect(state.jump.phase).toBe("NEUTRAL");

    const held = [];
    for (let index = 0; index < 10; index += 1) {
      const update = pushPose(state, pose({ time: 1000 + index * 40, leftArm: true }));
      state = update.state;
      held.push(...update.events);
    }
    expect(held).toHaveLength(0);
    expect(state.awaitRelease).toBe(true);
    expect(state.left.phase).toBe("NEUTRAL");

    for (let index = 0; index < 3; index += 1) {
      const update = pushPose(state, pose({ time: 2000 + index * 40 }));
      state = update.state;
      expect(update.events).toHaveLength(0);
    }
    expect(state.awaitRelease).toBe(false);

    const raised = [];
    for (let index = 0; index < 8; index += 1) {
      const update = pushPose(state, pose({ time: 3000 + index * 40, leftArm: true }));
      state = update.state;
      raised.push(...update.events);
    }
    expect(raised.map((event) => event.movementType)).toContain("lean_left");
  });

  it("accepts a right arm, squat, and jump after tracking resumes", () => {
    const arm = (side: "leftArm" | "rightArm") => {
      let state = createDetector({ mirror: false, smoothingAlpha: 1, cooldownMs: 0 });
      const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
      if (!neutral) throw new Error("Failed to build a neutral pose");
      state = setNeutral(state, neutral);
      state = settleGestures(state);
      state = pushPose(state, pose({ time: 1000 })).state;
      const events = [];
      for (let index = 0; index < 8; index += 1) {
        const update = pushPose(state, pose({ time: 1200 + index * 40, [side]: true }));
        state = update.state;
        events.push(...update.events);
      }
      return events.map((event) => event.movementType);
    };
    expect(arm("leftArm")).toContain("lean_left");
    expect(arm("rightArm")).toContain("lean_right");

    let state = createDetector({ mirror: false, smoothingAlpha: 1, cooldownMs: 0 });
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    state = setNeutral(state, neutral);
    state = settleGestures(state);
    const heldSquat = [];
    for (let index = 0; index < 6; index += 1) {
      const update = pushPose(state, pose({ time: 1000 + index * 50, hipDrop: 0.2 }));
      state = update.state;
      heldSquat.push(...update.events);
    }
    expect(heldSquat).toHaveLength(0);
    expect(state.squat.phase).toBe("NEUTRAL");
    for (let index = 0; index < 3; index += 1) {
      state = pushPose(state, pose({ time: 2000 + index * 50 })).state;
    }
    const ducked = [];
    for (let index = 0; index < 8; index += 1) {
      const update = pushPose(state, pose({ time: 2300 + index * 50, hipDrop: 0.2 }));
      state = update.state;
      ducked.push(...update.events);
    }
    expect(ducked.filter((event) => event.movementType === "squat")).toHaveLength(1);

    state = settleGestures(state);
    state = pushPose(state, pose({ time: 3000 })).state;
    const jumped = [];
    for (let index = 0; index < 8; index += 1) {
      const update = pushPose(state, pose({ time: 3200 + index * 80, rise: index < 3 ? 0 : 0.1 }));
      state = update.state;
      jumped.push(...update.events);
    }
    expect(jumped.map((event) => event.movementType)).toContain("jump");
  });
});

describe("motion reliability sequences", () => {
  it("sends one left command for an overhead left raise", () => {
    const { events } = feed(8, (index) => pose({ time: index * 50, leftOverhead: index >= 2 }));
    expect(events.map((event) => event.movementType)).toEqual(["lean_left"]);
  });

  it("sends one right command for an overhead right raise", () => {
    const { events } = feed(8, (index) => pose({ time: index * 50, rightOverhead: index >= 2 }));
    expect(events.map((event) => event.movementType)).toEqual(["lean_right"]);
  });

  it("keeps an overhead left raise on the left after the selfie mirror", () => {
    const mirrored = feed(8, (index) => pose({ time: index * 50, leftOverhead: index >= 2 }), true);
    expect(mirrored.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    const right = feed(8, (index) => pose({ time: index * 50, rightOverhead: index >= 2 }), true);
    expect(right.events.map((event) => event.movementType)).toEqual(["lean_right"]);
  });

  it("sends neither lane command when both arms are overhead", () => {
    const { events, state } = feed(8, (index) =>
      pose({ time: index * 50, leftOverhead: index >= 2, rightOverhead: index >= 2 }),
    );
    expect(events).toHaveLength(0);
    expect(state.lastReject?.reason).toBe("both_arms");
  });

  it("does not repeat a held overhead arm and fires again only after it lowers", () => {
    const { events } = feed(18, (index) => pose({ time: index * 50, leftOverhead: index >= 2 && index < 8 ? true : index >= 14 }));
    expect(events.filter((event) => event.movementType === "lean_left")).toHaveLength(2);
    expect(events.filter((event) => event.movementType === "lean_right")).toHaveLength(0);
  });

  it("counts a small hop while the hips are still rising out of the dip", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    const { events } = feed(16, (index) => {
      const dipping = index >= 2 && index <= 5;
      const rising = index === 6 || index === 7;
      return pose({
        time: index * 40,
        hipDrop: dipping ? 0.03 : rising ? 0.012 : 0,
        rise: rising ? 0.008 : 0,
        kneeForward: dipping || rising ? 0.08 : undefined,
      });
    });
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(1);
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
  });

  it("counts one normal jump and does not count the landing", () => {
    const { events } = feed(14, (index) => {
      const dipping = index === 3;
      const rising = index >= 4 && index <= 7;
      const landing = index >= 8;
      return pose({
        time: index * 40,
        hipDrop: dipping ? 0.05 : 0,
        rise: rising ? 0.06 : landing ? 0 : 0,
        kneeForward: dipping ? 0.08 : undefined,
      });
    });
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(1);
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
  });

  it("ignores sway that never becomes a raise, squat, or jump", () => {
    const { events } = feed(16, (index) =>
      pose({
        time: index * 40,
        lean: index % 2 === 0 ? -0.02 : 0.02,
        hipDrop: index % 2 === 0 ? 0.008 : 0,
      }),
    );
    expect(events).toHaveLength(0);
  });

  it("emits nothing for a partial body, low confidence, or a tracking gap", () => {
    const partial = feed(8, (index) => pose({ time: index * 40, leftOverhead: true, hipDrop: 0.2, hide: [11, 27] }));
    expect(partial.events).toHaveLength(0);
    expect(partial.state.lastReject?.reason).toBe("tracking_lost");

    const dim = feed(8, (index) => pose({ time: index * 40, leftOverhead: true, visibility: 0.5 }));
    expect(dim.events).toHaveLength(0);
    expect(dim.state.lastReject?.reason).toBe("low_confidence");
    expect(DEFAULT_THRESHOLDS.minActionConfidence).toBe(0.6);
    expect(DEFAULT_THRESHOLDS.minVisibility).toBe(0.45);

    const gap = feed(12, (index) =>
      pose({
        time: index * 40,
        leftOverhead: index >= 2,
        hide: index >= 3 && index <= 8 ? [11, 12, 23, 24] : [],
      }),
    );
    const left = gap.events.filter((event) => event.movementType === "lean_left");
    expect(left.map((event) => event.clientTimestamp)).toEqual([2 * 40]);
  });

  it("sends one left command for a halfway raise and one for a sideways point", () => {
    const halfway = feed(8, (index) => pose({ time: index * 50, leftHalfway: index >= 2 }));
    expect(halfway.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    expect(halfway.state.left.phase).toBe("WAIT_FOR_RELEASE");
    const sideways = feed(8, (index) => pose({ time: index * 50, leftSideways: index >= 2 }));
    expect(sideways.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    expect(sideways.state.left.phase).toBe("WAIT_FOR_RELEASE");
  });

  it("sends one right command for a halfway raise and one for a sideways point", () => {
    const halfway = feed(8, (index) => pose({ time: index * 50, rightHalfway: index >= 2 }));
    expect(halfway.events.map((event) => event.movementType)).toEqual(["lean_right"]);
    const sideways = feed(8, (index) => pose({ time: index * 50, rightSideways: index >= 2 }));
    expect(sideways.events.map((event) => event.movementType)).toEqual(["lean_right"]);
  });

  it("does not repeat a held halfway arm, then fires again after it lowers", () => {
    const { events, state } = feed(20, (index) => pose({ time: index * 50, leftHalfway: index >= 2 && index < 10 ? true : index >= 15 }));
    expect(events.filter((event) => event.movementType === "lean_left")).toHaveLength(2);
    expect(state.left.phase).toBe("WAIT_FOR_RELEASE");
  });

  it("does not change lanes for a running arm swing or for both arms at once", () => {
    const swing = feed(16, (index) => pose({ time: index * 40, runningArms: true }));
    expect(swing.events.filter((event) => event.movementType === "lean_left" || event.movementType === "lean_right")).toHaveLength(0);

    const both = feed(8, (index) => pose({ time: index * 50, leftHalfway: index >= 2, rightHalfway: index >= 2 }));
    expect(both.events).toHaveLength(0);
    expect(both.state.lastReject?.reason).toBe("both_arms");
  });

  it("keeps a halfway left raise on the left after the selfie mirror", () => {
    const mirrored = feed(8, (index) => pose({ time: index * 50, leftHalfway: index >= 2 }), true);
    expect(mirrored.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    const right = feed(8, (index) => pose({ time: index * 50, rightSideways: index >= 2 }), true);
    expect(right.events.map((event) => event.movementType)).toEqual(["lean_right"]);
  });

  it("recognizes the same raise and the same jump on the left third, center, and right third", () => {
    for (const cx of [0.28, 0.5, 0.72]) {
      const raised = feed(8, (index) => pose({ time: index * 50, cx, leftHalfway: index >= 2 }));
      expect(raised.events.map((event) => event.movementType)).toEqual(["lean_left"]);
      const hopped = feed(10, (index) => pose({ time: index * 50, cx, rise: index === 3 ? 0.08 : 0 }));
      expect(hopped.events.filter((event) => event.movementType === "jump")).toHaveLength(1);
      expect(hopped.events.filter((event) => event.movementType === "lean_left" || event.movementType === "lean_right")).toHaveLength(0);
    }
  });

  it("keeps calibration when the body walks across the frame, and does not emit while walking", () => {
    let state = createDetector({ mirror: false, smoothingAlpha: 1 });
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    state = setNeutral(state, neutral);
    const events = [];
    for (let index = 0; index < 12; index += 1) {
      const update = pushPose(state, pose({ time: 100 + index * 40, cx: 0.32 + index * 0.03 }));
      state = update.state;
      events.push(...update.events);
    }
    expect(events).toHaveLength(0);
    expect(state.neutral).not.toBeNull();
    expect(state.neutral?.centerX).not.toBe(neutral.centerX);
    const raised = [];
    for (let index = 0; index < 8; index += 1) {
      const update = pushPose(state, pose({ time: 2000 + index * 50, cx: 0.68, leftSideways: index >= 2 }));
      state = update.state;
      raised.push(...update.events);
    }
    expect(raised.map((event) => event.movementType)).toEqual(["lean_left"]);
  });

  it("emits a jump and a squat again after the round reset, and still changes lanes", () => {
    let state = createDetector({ mirror: false, smoothingAlpha: 1, cooldownMs: 0 });
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    state = setNeutral(state, neutral);
    const first: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const update = pushPose(state, pose({ time: index * 50, rise: index === 3 ? 0.05 : 0 }));
      state = update.state;
      first.push(...update.events.map((event) => event.movementType));
    }
    expect(first).toContain("jump");
    for (let index = 0; index < 10; index += 1) {
      const update = pushPose(state, pose({ time: 1000 + index * 50, hipDrop: index >= 2 && index < 8 ? 0.2 : 0 }));
      state = update.state;
      first.push(...update.events.map((event) => event.movementType));
    }
    expect(first.filter((event) => event === "squat")).toHaveLength(1);

    state = {
      ...state,
      phase: "JUMPING",
      jumpMotion: "airborne",
      prepSince: 1800,
      jump: { phase: "WAIT_RESET", since: 1800, eventId: "still-airborne", suppress: false },
    };
    for (let index = 0; index < 4; index += 1) {
      state = pushPose(state, pose({ time: 2000 + index * 40, rise: 0.2 })).state;
    }
    expect(state.jump.phase).not.toBe("NEUTRAL");
    expect(state.jumpMotion).not.toBe("grounded");
    const blocked: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const update = pushPose(state, pose({ time: 3000 + index * 50, rise: 0.2, leftArm: index >= 2 }));
      state = update.state;
      blocked.push(...update.events.map((event) => event.movementType));
    }
    expect(blocked).toEqual([]);

    state = resetMovementReady(state);
    expect(state.jumpMotion).toBe("grounded");
    expect(state.jump.phase).toBe("NEUTRAL");
    expect(state.squat.phase).toBe("NEUTRAL");
    expect(state.prepSince).toBeNull();
    expect(state.awaitRelease).toBe(false);
    expect(state.neutral?.kneeAngle).toBe(neutral.kneeAngle);
    const carried: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const update = pushPose(state, pose({ time: 4000 + index * 40, rise: 0.08 }));
      state = update.state;
      carried.push(...update.events.map((event) => event.movementType));
    }
    expect(carried.filter((event) => event === "jump" || event === "squat")).toEqual([]);

    state = resetMovementReady(state);
    const again: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const update = pushPose(state, pose({ time: 5000 + index * 40 }));
      state = update.state;
      again.push(...update.events.map((event) => event.movementType));
    }
    for (let index = 0; index < 8; index += 1) {
      const update = pushPose(state, pose({ time: 6000 + index * 50, rise: index === 3 ? 0.05 : 0 }));
      state = update.state;
      again.push(...update.events.map((event) => event.movementType));
    }
    for (let index = 0; index < 10; index += 1) {
      const update = pushPose(state, pose({ time: 7000 + index * 50, hipDrop: index >= 2 && index < 8 ? 0.2 : 0 }));
      state = update.state;
      again.push(...update.events.map((event) => event.movementType));
    }
    for (let index = 0; index < 8; index += 1) {
      const update = pushPose(state, pose({ time: 8000 + index * 50, leftArm: index >= 2 }));
      state = update.state;
      again.push(...update.events.map((event) => event.movementType));
    }
    expect(again.filter((event) => event === "jump")).toEqual(["jump"]);
    expect(again.filter((event) => event === "squat")).toEqual(["squat"]);
    expect(again.filter((event) => event === "lean_left")).toEqual(["lean_left"]);
  });

  it("emits a new squat and a new jump after the phone listener reset clears a sent airborne jump", () => {
    let state = createDetector({ mirror: false, smoothingAlpha: 1, cooldownMs: 0 });
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    state = setNeutral(state, neutral);
    state = {
      ...state,
      phase: "JUMPING",
      jumpMotion: "airborne",
      jump: { phase: "SENT", since: 0, eventId: "stuck-air", suppress: false },
    };
    const blocked: string[] = [];
    for (let index = 0; index < 6; index += 1) {
      const update = pushPose(state, pose({ time: 1000 + index * 40, rise: 0.2 }));
      state = update.state;
      blocked.push(...update.events.map((event) => event.movementType));
    }
    expect(blocked.filter((event) => event === "jump" || event === "squat")).toEqual([]);
    expect(state.jump.phase).not.toBe("NEUTRAL");

    state = resetPhoneForRound(state);
    expect(state.jumpMotion).toBe("grounded");
    expect(state.jump.phase).toBe("NEUTRAL");
    expect(state.squat.phase).toBe("NEUTRAL");
    expect(state.prepSince).toBeNull();
    expect(state.awaitRelease).toBe(false);
    expect(state.neutral?.kneeAngle).toBe(neutral.kneeAngle);

    const again: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const update = pushPose(state, pose({ time: 2000 + index * 50, rise: index === 3 ? 0.05 : 0 }));
      state = update.state;
      again.push(...update.events.map((event) => event.movementType));
    }
    for (let index = 0; index < 10; index += 1) {
      const update = pushPose(state, pose({ time: 3000 + index * 50, hipDrop: index >= 2 && index < 8 ? 0.2 : 0 }));
      state = update.state;
      again.push(...update.events.map((event) => event.movementType));
    }
    expect(again.filter((event) => event === "jump")).toEqual(["jump"]);
    expect(again.filter((event) => event === "squat")).toEqual(["squat"]);
  });

  it("does not let a squat emit a jump, and still uses the 0.32 rise gate", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    const squat = feed(10, (index) => pose({ time: index * 50, hipDrop: index >= 2 ? 0.2 : 0 }));
    expect(squat.events.map((event) => event.movementType)).toEqual(["squat"]);
  });

  it("recognizes one squat from a hip drop and a shorter torso when the legs are covered", () => {
    const covered = feed(22, (index) => {
      const down = index >= 2 && index < 14;
      return pose({ time: index * 33, hipDrop: down ? 0.22 : 0, bow: down ? 0.25 : 0, coverLegs: true });
    });
    expect(covered.events.map((event) => event.movementType)).toEqual(["squat"]);

    const missing = feed(22, (index) => {
      const down = index >= 2 && index < 14;
      return pose({
        time: index * 33,
        hipDrop: down ? 0.22 : 0,
        bow: down ? 0.25 : 0,
        hide: [25, 26, 27, 28],
      });
    });
    expect(missing.events.map((event) => event.movementType)).toEqual(["squat"]);
  });

  it("recognizes two covered-leg jumps from a dip then a hip rise, and a second after landing", () => {
    const { events } = feed(18, (index) => {
      const dip = index === 2 || index === 9;
      const rise = index === 3 || index === 4 || index === 10 || index === 11;
      return pose({ time: index * 33, hipDrop: dip ? 0.12 : 0, rise: rise ? 0.08 : 0, coverLegs: true });
    });
    expect(events.map((event) => event.movementType)).toEqual(["jump", "jump"]);
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
  });

  it("does not duck or jump for covered-leg running in place or a slight bow", () => {
    const running = feed(16, (index) => pose({ time: index * 33, hipDrop: index % 2 === 0 ? 0 : 0.04, coverLegs: true }));
    expect(running.events).toHaveLength(0);

    const bow = feed(14, (index) => pose({ time: index * 40, bow: index >= 2 ? 0.03 : 0, coverLegs: true }));
    expect(bow.events).toHaveLength(0);
  });

  it("still changes lanes when the legs are covered", () => {
    const { events } = feed(18, (index) =>
      pose({
        time: index * 40,
        coverLegs: true,
        rightArm: index >= 2 && index < 8,
        leftArm: index >= 11,
      }),
    );
    expect(events.map((event) => event.movementType)).toEqual(["lean_right", "lean_left"]);
  });

  it("keeps a measured leg length while later quiet frames hide the legs", () => {
    let state = createDetector({ smoothingAlpha: 1 });
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    state = setNeutral(state, neutral);
    for (let index = 0; index < 20; index += 1) {
      state = pushPose(state, pose({ time: index * 40, coverLegs: true })).state;
    }
    expect(state.neutral?.thighLength).toBeCloseTo(neutral.thighLength, 5);
    expect(state.neutral?.shinLength).toBeCloseTo(neutral.shinLength, 5);

    const frames = Array.from({ length: 8 }, (_, index) => pose({ time: index * 40, coverLegs: true }));
    const calibrated = calibrateNeutral(frames, DEFAULT_THRESHOLDS.minVisibility);
    expect(calibrated.stable).toBe(true);
    expect(calibrated.neutral?.legsMeasured).toBe(false);
  });

  it("emits a clear lane, squat, and jump within two camera frames of the pose", () => {
    const frameMs = 33;
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    const delayFor = (events: Array<{ movementType: string; clientTimestamp: number }>, type: string, crossedAt: number) => {
      const event = events.find((item) => item.movementType === type);
      expect(event).toBeTruthy();
      const delay = (event?.clientTimestamp ?? 0) - crossedAt;
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThan(100);
      return delay;
    };

    let lane = setNeutral(createDetector({ mirror: false }), neutral);
    const laneEvents = [];
    const laneAt = 4 * frameMs;
    for (let index = 0; index < 12; index += 1) {
      const time = index * frameMs;
      const update = pushPose(lane, pose({ time, leftArm: time >= laneAt }));
      lane = update.state;
      laneEvents.push(...update.events);
    }
    const laneDelayMs = delayFor(laneEvents, "lean_left", laneAt);

    let squat = setNeutral(createDetector({ mirror: false }), neutral);
    const squatEvents = [];
    const squatAt = 4 * frameMs;
    for (let index = 0; index < 14; index += 1) {
      const time = index * frameMs;
      const down = time >= squatAt;
      const update = pushPose(squat, pose({ time, hipDrop: down ? 0.22 : 0, bow: down ? 0.25 : 0 }));
      squat = update.state;
      squatEvents.push(...update.events);
    }
    const squatDelayMs = delayFor(squatEvents, "squat", squatAt);
    expect(squatDelayMs).toBeLessThanOrEqual(frameMs * 2);
    expect(squatDelayMs).toBeLessThan(70);
    expect(squatEvents.filter((event) => event.movementType === "jump")).toHaveLength(0);

    let jump = setNeutral(createDetector({ mirror: false }), neutral);
    const jumpEvents = [];
    const riseAt = 6 * frameMs;
    for (let index = 0; index < 12; index += 1) {
      const time = index * frameMs;
      const dipping = index === 5;
      const rising = index === 6 || index === 7;
      const update = pushPose(jump, pose({ time, hipDrop: dipping ? 0.08 : 0, rise: rising ? 0.08 : 0 }));
      jump = update.state;
      jumpEvents.push(...update.events);
    }
    const jumpDelayMs = delayFor(jumpEvents, "jump", riseAt);
    expect(jumpDelayMs).toBeLessThanOrEqual(frameMs);
    expect(jumpDelayMs).toBeLessThan(70);
    expect(jumpEvents.filter((event) => event.movementType === "squat")).toHaveLength(0);
    console.log(JSON.stringify({
      frameMs,
      laneDelayMs,
      squatDelayMs,
      jumpDelayMs,
      smoothingAlpha: DEFAULT_THRESHOLDS.smoothingAlpha,
      armHoldMs: DEFAULT_THRESHOLDS.armHoldMs,
      squatHoldMs: DEFAULT_THRESHOLDS.squatHoldMs,
      jumpPrepMs: DEFAULT_THRESHOLDS.jumpPrepMs,
    }));
  });

  it("emits a one-frame arm that is already up, and ignores a one-frame hip bob", () => {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let arm = setNeutral(createDetector({ mirror: false }), neutral);
    const armEvents = [];
    for (let index = 0; index < 8; index += 1) {
      const update = pushPose(arm, pose({ time: index * 33, leftArm: index === 3 }));
      arm = update.state;
      armEvents.push(...update.events);
    }
    expect(armEvents.map((event) => event.movementType)).toEqual(["lean_left"]);

    let bob = setNeutral(createDetector({ mirror: false }), neutral);
    const bobEvents = [];
    for (let index = 0; index < 8; index += 1) {
      const down = index === 3;
      const update = pushPose(bob, pose({ time: index * 33, hipDrop: down ? 0.22 : 0, bow: down ? 0.25 : 0 }));
      bob = update.state;
      bobEvents.push(...update.events);
    }
    expect(bobEvents.filter((event) => event.movementType === "squat")).toHaveLength(0);
  });

  it("emits ten squats in a row, including one with hidden knees, and ignores a one-frame bob", () => {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    const depths = [0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.18, 0.2, 0.22, 0.16];
    let state = setNeutral(createDetector({ mirror: false }), neutral);
    const events = [];
    let time = 0;
    const step = (frame: ReturnType<typeof pose>) => {
      const update = pushPose(state, frame);
      state = update.state;
      events.push(...update.events);
      time += 33;
    };
    for (let squat = 0; squat < depths.length; squat += 1) {
      const depth = depths[squat]!;
      const covered = squat === 9;
      for (let index = 0; index < 3; index += 1) step(pose({ time, coverLegs: covered }));
      step(pose({ time, hipDrop: depth, coverLegs: covered }));
      step(pose({ time, hipDrop: depth, coverLegs: covered }));
      step(pose({ time, hipDrop: depth, coverLegs: covered, hide: covered ? [25, 26, 27, 28] : [] }));
      for (let index = 0; index < 8; index += 1) step(pose({ time, coverLegs: covered }));
    }
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(10);
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(0);

    let bob = setNeutral(createDetector({ mirror: false }), neutral);
    const bobEvents = [];
    for (let index = 0; index < 6; index += 1) {
      const update = pushPose(bob, pose({ time: 10000 + index * 33, hipDrop: index === 2 ? 0.2 : 0 }));
      bob = update.state;
      bobEvents.push(...update.events);
    }
    expect(bobEvents).toHaveLength(0);
  });

  it("emits one moderate squat and ignores a slight hip bob", () => {
    const previousEnter = 0.16;
    expect(DEFAULT_THRESHOLDS.squatEnterDrop).toBe(0.1);
    expect(DEFAULT_THRESHOLDS.squatEnterDrop).toBeLessThan(previousEnter);
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    const measure = (hipDrop: number) => {
      const state = setNeutral(createDetector({ mirror: false, smoothingAlpha: 1 }), neutral);
      return pushPose(state, pose({ time: 33, hipDrop })).signals?.hipDrop ?? 0;
    };
    const moderateDrop = measure(0.024);
    const slightDrop = measure(0.01);
    expect(moderateDrop).toBeGreaterThan(DEFAULT_THRESHOLDS.squatEnterDrop);
    expect(moderateDrop).toBeLessThan(previousEnter);
    expect(slightDrop).toBeGreaterThan(0.03);
    expect(slightDrop).toBeLessThan(DEFAULT_THRESHOLDS.squatEnterDrop);

    const moderate = feed(8, (index) => pose({ time: index * 33, hipDrop: index >= 2 && index < 6 ? 0.024 : 0 }));
    expect(moderate.events.filter((event) => event.movementType === "squat")).toHaveLength(1);
    expect(moderate.events.filter((event) => event.movementType === "jump")).toHaveLength(0);

    const stand = feed(12, (index) => pose({ time: index * 33, hipDrop: index >= 2 && index < 7 ? 0.024 : 0 }));
    expect(stand.events.map((event) => event.movementType)).toEqual(["squat"]);

    const covered = feed(8, (index) =>
      pose({ time: index * 33, hipDrop: index >= 2 && index < 6 ? 0.024 : 0, coverLegs: true }),
    );
    expect(covered.events.filter((event) => event.movementType === "squat")).toHaveLength(1);
    expect(covered.events.filter((event) => event.movementType === "jump")).toHaveLength(0);

    const slight = feed(8, (index) => pose({ time: index * 33, hipDrop: index >= 2 ? 0.01 : 0 }));
    expect(slight.events.filter((event) => event.movementType === "squat" || event.movementType === "jump")).toHaveLength(0);
    const oneFrame = feed(8, (index) => pose({ time: index * 33, hipDrop: index === 3 ? 0.024 : 0 }));
    expect(oneFrame.events).toHaveLength(0);
    console.log(JSON.stringify({
      previousSquatEnter: previousEnter,
      squatEnterDrop: DEFAULT_THRESHOLDS.squatEnterDrop,
      moderateDrop: Number(moderateDrop.toFixed(3)),
      slightDrop: Number(slightDrop.toFixed(3)),
    }));
  });

  it("emits ten bent-knee hops once each without lowering jumpRise", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false }), neutral);
    const events = [];
    let peak = 0;
    let kneeOnJump = 180;
    let time = 0;
    for (let hop = 0; hop < 10; hop += 1) {
      const rise = 0.018 + (hop % 5) * 0.006;
      const knee = 0.08 + (hop % 4) * 0.02;
      for (let index = 0; index < 14; index += 1) {
        const dipping = index === 3;
        const rising = index === 4 || index === 5;
        const update = pushPose(
          state,
          pose({
            time,
            hipDrop: dipping ? 0.012 : 0,
            rise: rising ? rise : 0,
            kneeForward: rising ? knee : 0.01,
          }),
        );
        state = update.state;
        peak = Math.max(peak, update.signals?.hipVelocity ?? 0, update.signals?.riseSpeed ?? 0);
        if (update.events.some((event) => event.movementType === "jump") && update.signals) {
          kneeOnJump = Math.min(kneeOnJump, update.signals.kneeAngle);
        }
        events.push(...update.events);
        time += 33;
      }
    }
    const jumps = events.filter((event) => event.movementType === "jump");
    expect(jumps).toHaveLength(10);
    expect(new Set(jumps.map((event) => event.eventId)).size).toBe(10);
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
    expect(peak).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.jumpRise);
    expect(kneeOnJump).toBeLessThan(DEFAULT_THRESHOLDS.squatKneeEnter);
    const bob = feed(8, (index) => pose({ time: index * 33, hipDrop: index === 3 ? 0.08 : 0 }));
    expect(bob.events.filter((event) => event.movementType === "jump")).toHaveLength(0);
    console.log(JSON.stringify({
      bentHopPeak: Number(peak.toFixed(2)),
      kneeOnJump: Number(kneeOnJump.toFixed(1)),
      jumpRise: DEFAULT_THRESHOLDS.jumpRise,
    }));
  });

  it("emits ten small hops once each, and a hop just over the measured line, but not running in place", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false }), neutral);
    const events = [];
    let peak = 0;
    let time = 0;
    for (let hop = 0; hop < 10; hop += 1) {
      for (let index = 0; index < 16; index += 1) {
        const dip = index === 3;
        const rise = index === 4 || index === 5;
        const update = pushPose(state, pose({ time, hipDrop: dip ? 0.06 : 0, rise: rise ? 0.05 : 0 }));
        state = update.state;
        peak = Math.max(peak, update.signals?.hipVelocity ?? 0, update.signals?.riseSpeed ?? 0);
        events.push(...update.events);
        time += 33;
      }
    }
    expect(events.filter((event) => event.movementType === "jump")).toHaveLength(10);
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
    expect(peak).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.jumpRise);

    // A 2.2mm image rise in 33ms on a 0.2 torso is raw speed 0.34. Smoothing at 0.92 would report 0.31.
    const frameSec = 0.033;
    const torso = 0.2;
    const rawDelta = 0.002244;
    const rawSpeed = rawDelta / frameSec / torso;
    const smoothedOnly = rawSpeed * DEFAULT_THRESHOLDS.smoothingAlpha;
    expect(rawSpeed).toBeGreaterThan(DEFAULT_THRESHOLDS.jumpRise);
    expect(smoothedOnly).toBeLessThan(DEFAULT_THRESHOLDS.jumpRise);
    let edge = setNeutral(createDetector({ mirror: false }), neutral);
    const edgeEvents = [];
    let edgePeak = 0;
    for (let index = 0; index < 10; index += 1) {
      const dip = index === 3 || index === 4;
      const update = pushPose(
        edge,
        pose({ time: 20000 + index * 33, hipDrop: dip || index === 5 ? 0.03 : 0, rise: index === 5 ? rawDelta : 0 }),
      );
      edge = update.state;
      edgePeak = Math.max(edgePeak, update.signals?.hipVelocity ?? 0, update.signals?.riseSpeed ?? 0);
      edgeEvents.push(...update.events);
    }
    expect(edgeEvents.filter((event) => event.movementType === "jump")).toHaveLength(1);
    expect(edgePeak).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.jumpRise);
    console.log(JSON.stringify({
      tenHopPeak: Number(peak.toFixed(2)),
      edgeRawSpeed: Number(rawSpeed.toFixed(3)),
      edgeSmoothedOnly: Number(smoothedOnly.toFixed(3)),
      edgeMeasuredPeak: Number(edgePeak.toFixed(3)),
      jumpRise: DEFAULT_THRESHOLDS.jumpRise,
    }));

    const running = feed(16, (index) => pose({ time: index * 33, hipDrop: index % 2 === 0 ? 0 : 0.04 }));
    expect(running.events.filter((event) => event.movementType === "jump" || event.movementType === "squat")).toHaveLength(0);
  });

  it("does not turn a one-frame hip twitch into a jump while the dip confirm is on", () => {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    const twitch = (jumpPrepMs: number) => {
      let state = setNeutral(createDetector({ mirror: false, jumpPrepMs }), neutral);
      const found = [];
      for (let index = 0; index < 8; index += 1) {
        const update = pushPose(state, pose({ time: index * 33, hipDrop: index === 3 ? 0.08 : 0 }));
        state = update.state;
        found.push(...update.events);
      }
      return found;
    };
    expect(twitch(0).filter((event) => event.movementType === "jump")).toHaveLength(1);
    expect(twitch(DEFAULT_THRESHOLDS.jumpPrepMs).filter((event) => event.movementType === "jump")).toHaveLength(0);
  });

  it("jumps a moving dip that crosses the squat line, including bent knees and a hop after a squat", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    const play = (frames: PoseFrame[]) => {
      let state = setNeutral(createDetector({ mirror: false }), neutral);
      const events = [];
      let peak = 0;
      for (const frame of frames) {
        const update = pushPose(state, frame);
        state = update.state;
        peak = Math.max(peak, update.signals?.hipVelocity ?? 0, update.signals?.riseSpeed ?? 0);
        events.push(...update.events);
      }
      return { events, peak };
    };
    const frame = 33;
    const varied = [
      { peak: 0.025, cover: false, knee: 0.02 },
      { peak: 0.04, cover: false, knee: 0.04 },
      { peak: 0.05, cover: false, knee: 0.05 },
      { peak: 0.08, cover: false, knee: 0.06 },
      { peak: 0.045, cover: false, knee: 0.09 },
      { peak: 0.04, cover: true, knee: 0.05 },
      { peak: 0.055, cover: true, knee: 0.08 },
      { peak: 0.03, cover: false, knee: 0.03 },
      { peak: 0.07, cover: false, knee: 0.07 },
      { peak: 0.035, cover: false, knee: 0.04 },
    ];
    const hops = [];
    const peaks: number[] = [];
    let clock = 0;
    for (const hop of varied) {
      const frames: PoseFrame[] = [];
      for (let index = 0; index < 16; index += 1) {
        const down = index >= 3 && index <= 5;
        const step = down ? (index - 2) / 3 : 0;
        const rising = index === 6;
        frames.push(
          pose({
            time: clock,
            hipDrop: down ? hop.peak * step : 0,
            rise: rising ? Math.max(0.012, hop.peak * 0.35) : 0,
            kneeForward: hop.knee,
            coverLegs: hop.cover,
          }),
        );
        clock += frame;
      }
      const played = play(frames);
      hops.push(...played.events);
      peaks.push(played.peak);
      expect(played.peak).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.jumpRise);
    }
    expect(hops.filter((event) => event.movementType === "jump")).toHaveLength(10);
    expect(hops.filter((event) => event.movementType === "squat")).toHaveLength(0);
    expect(new Set(hops.filter((event) => event.movementType === "jump").map((event) => event.eventId)).size).toBe(10);

    const deep = play(
      Array.from({ length: 12 }, (_, index) =>
        pose({
          time: 20000 + index * frame,
          hipDrop: index === 3 ? 0.02 : index === 4 ? 0.04 : index === 5 ? 0.055 : 0,
          rise: index === 6 ? 0.02 : 0,
          straightKnees: true,
        }),
      ),
    );
    expect(deep.events.map((event) => event.movementType)).toEqual(["jump"]);
    const riseAt = 20000 + 6 * frame;
    expect((deep.events[0]?.clientTimestamp ?? 0) - riseAt).toBe(0);

    const afterSquat = play([
      ...Array.from({ length: 2 }, (_, index) => pose({ time: index * frame })),
      ...Array.from({ length: 4 }, (_, index) => pose({ time: (2 + index) * frame, hipDrop: 0.08, bow: 0.02 })),
      ...Array.from({ length: 6 }, (_, index) => pose({ time: (6 + index) * frame })),
      pose({ time: 12 * frame, hipDrop: 0.02 }),
      pose({ time: 13 * frame, hipDrop: 0.05, kneeForward: 0.06 }),
      pose({ time: 14 * frame, rise: 0.02, straightKnees: true }),
      ...Array.from({ length: 6 }, (_, index) => pose({ time: (15 + index) * frame })),
    ]);
    expect(afterSquat.events.map((event) => event.movementType)).toEqual(["squat", "jump"]);
    console.log(JSON.stringify({
      variedHopPeak: Number(Math.max(...peaks, deep.peak, afterSquat.peak).toFixed(2)),
      deepJumpDelayMs: 0,
      jumpRise: DEFAULT_THRESHOLDS.jumpRise,
    }));
  });

  it("emits squat, then right, then jump when each follows within a few frames", () => {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    const frame = 33;
    const script: PoseFrame[] = [];
    let time = 0;
    const add = (count: number, extra: Omit<Parameters<typeof pose>[0], "time">) => {
      for (let index = 0; index < count; index += 1) {
        script.push(pose({ ...extra, time }));
        time += frame;
      }
    };
    add(2, {});
    add(4, { hipDrop: 0.08, bow: 0.02 });
    add(5, {});
    add(3, { rightArm: true });
    add(4, {});
    add(1, { hipDrop: 0.02 });
    add(1, { hipDrop: 0.05, kneeForward: 0.06 });
    add(1, { rise: 0.02, straightKnees: true });
    add(6, {});
    let state = setNeutral(createDetector({ mirror: false }), neutral);
    const events = [];
    for (const step of script) {
      const update = pushPose(state, step);
      state = update.state;
      events.push(...update.events);
    }
    expect(events.map((event) => event.movementType)).toEqual(["squat", "lean_right", "jump"]);
    const gap = (index: number) => (events[index + 1]?.clientTimestamp ?? 0) - (events[index]?.clientTimestamp ?? 0);
    expect(gap(0)).toBeGreaterThanOrEqual(150);
    expect(gap(0)).toBeLessThanOrEqual(300);
    expect(gap(1)).toBeGreaterThanOrEqual(150);
    expect(gap(1)).toBeLessThanOrEqual(300);
    const squatAt = 2 * frame;
    const armAt = (2 + 4 + 5) * frame;
    const riseAt = (2 + 4 + 5 + 3 + 4 + 2) * frame;
    expect((events[0]?.clientTimestamp ?? 0) - squatAt).toBeLessThanOrEqual(66);
    expect((events[1]?.clientTimestamp ?? 0) - armAt).toBeLessThanOrEqual(frame);
    expect((events[2]?.clientTimestamp ?? 0) - riseAt).toBe(0);

    const reverse: PoseFrame[] = [];
    time = 0;
    const push = (count: number, extra: Omit<Parameters<typeof pose>[0], "time">) => {
      for (let index = 0; index < count; index += 1) {
        reverse.push(pose({ ...extra, time }));
        time += frame;
      }
    };
    push(2, {});
    push(1, { hipDrop: 0.02 });
    push(1, { hipDrop: 0.05, kneeForward: 0.05 });
    push(1, { rise: 0.02, straightKnees: true });
    push(6, {});
    push(3, { leftArm: true });
    push(4, {});
    push(4, { hipDrop: 0.08, bow: 0.02 });
    push(4, {});
    state = setNeutral(createDetector({ mirror: false }), neutral);
    const back = [];
    for (const step of reverse) {
      const update = pushPose(state, step);
      state = update.state;
      back.push(...update.events);
    }
    expect(back.map((event) => event.movementType)).toEqual(["jump", "lean_left", "squat"]);
  });

  it("emits left then right, and right then left, on the frame the hand is already out", () => {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    const frame = 33;
    const runSide = (first: "leftArm" | "rightArm", second: "leftArm" | "rightArm") => {
      let state = setNeutral(createDetector({ mirror: false }), neutral);
      const events = [];
      const firstAt = 2 * frame;
      const secondAt = 7 * frame;
      for (let index = 0; index < 12; index += 1) {
        const time = index * frame;
        const update = pushPose(
          state,
          pose({
            time,
            leftArm: (first === "leftArm" && index >= 2 && index <= 4) || (second === "leftArm" && index >= 7),
            rightArm: (first === "rightArm" && index >= 2 && index <= 4) || (second === "rightArm" && index >= 7),
          }),
        );
        state = update.state;
        events.push(...update.events);
      }
      return { events, firstAt, secondAt };
    };
    const leftRight = runSide("leftArm", "rightArm");
    expect(leftRight.events.map((event) => event.movementType)).toEqual(["lean_left", "lean_right"]);
    expect((leftRight.events[0]?.clientTimestamp ?? 0) - leftRight.firstAt).toBe(0);
    expect((leftRight.events[1]?.clientTimestamp ?? 0) - leftRight.secondAt).toBe(0);
    const rightLeft = runSide("rightArm", "leftArm");
    expect(rightLeft.events.map((event) => event.movementType)).toEqual(["lean_right", "lean_left"]);
    expect((rightLeft.events[0]?.clientTimestamp ?? 0) - rightLeft.firstAt).toBe(0);
    expect((rightLeft.events[1]?.clientTimestamp ?? 0) - rightLeft.secondAt).toBe(0);

    let held = setNeutral(createDetector({ mirror: false }), neutral);
    const heldEvents = [];
    for (let index = 0; index < 10; index += 1) {
      const update = pushPose(held, pose({ time: index * frame, leftArm: index >= 2 }));
      held = update.state;
      heldEvents.push(...update.events);
    }
    expect(heldEvents.map((event) => event.movementType)).toEqual(["lean_left"]);
  });
});

describe("body lean lane control", () => {
  const clear = 0.045;

  it("sends one lane per lean and requires a return to upright before the next", () => {
    expect(DEFAULT_THRESHOLDS.torsoLeanEnter).toBeGreaterThan(DEFAULT_THRESHOLDS.torsoLeanNeutral);
    expect(DEFAULT_THRESHOLDS.torsoLeanHoldMs).toBe(0);
    expect(DEFAULT_THRESHOLDS.armHoldMs).toBe(0);
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);

    const left = feed(8, (index) => pose({ time: index * 33, shoulderLean: index >= 2 ? -clear : 0 }));
    expect(left.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    expect((left.events[0]?.clientTimestamp ?? 0) - 2 * 33).toBe(0);
    expect((left.events[0]?.clientTimestamp ?? 0) - 2 * 33).toBeLessThan(70);

    const right = feed(8, (index) => pose({ time: index * 33, shoulderLean: index >= 2 ? clear : 0 }));
    expect(right.events.map((event) => event.movementType)).toEqual(["lean_right"]);

    const held = feed(14, (index) => pose({ time: index * 33, shoulderLean: index >= 2 ? -clear : 0 }));
    expect(held.events.map((event) => event.movementType)).toEqual(["lean_left"]);

    const reset = feed(16, (index) => {
      const shift = index < 2 ? 0 : index < 6 ? -clear : index < 10 ? 0 : clear;
      return pose({ time: index * 33, shoulderLean: shift });
    });
    expect(reset.events.map((event) => event.movementType)).toEqual(["lean_left", "lean_right"]);

    const chained = feed(12, (index) => {
      const shift = index < 2 ? 0 : index < 6 ? -clear : clear;
      return pose({ time: index * 33, shoulderLean: shift });
    });
    expect(chained.events.map((event) => event.movementType)).toEqual(["lean_left"]);

    const wobble = feed(8, (index) => pose({ time: index * 33, shoulderLean: index === 3 ? -clear : 0 }));
    expect(wobble.events.map((event) => event.movementType)).toEqual(["lean_left"]);

    const sway = feed(24, (index) =>
      pose({
        time: index * 33,
        hipDrop: index % 2 === 0 ? 0 : 0.04,
        shoulderLean: index % 2 === 0 ? -0.012 : 0.01,
        runningArms: true,
      }),
    );
    expect(sway.events.filter((event) => event.movementType === "lean_left" || event.movementType === "lean_right")).toHaveLength(0);
  });

  it("measures the lean from the calibrated shoulders and keeps the arm raise as a single fallback", () => {
    const standing = pose({ time: 0, shoulderLean: 0.02 });
    const neutral = neutralFromLandmarks(standing.landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    expect(neutral.shoulderHip).toBeGreaterThan(0.08);
    let state = setNeutral(createDetector({ mirror: false, smoothingAlpha: 1 }), neutral);
    const same = pushPose(state, pose({ time: 40, shoulderLean: 0.02 }));
    expect(same.events).toHaveLength(0);
    expect(Math.abs(same.signals?.torsoLean ?? 1)).toBeLessThan(0.02);
    state = same.state;
    const events = [];
    for (let index = 0; index < 4; index += 1) {
      const update = pushPose(state, pose({ time: 80 + index * 33, shoulderLean: 0.065 }));
      state = update.state;
      events.push(...update.events);
    }
    expect(events.map((event) => event.movementType)).toEqual(["lean_right"]);

    const both = feed(8, (index) =>
      pose({ time: index * 33, leftArm: index >= 2, shoulderLean: index >= 2 ? -clear : 0 }),
    );
    expect(both.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    expect(new Set(both.events.map((event) => event.eventId)).size).toBe(1);

    const arm = feed(8, (index) => pose({ time: index * 33, rightArm: index >= 2 }));
    expect(arm.events.map((event) => event.movementType)).toEqual(["lean_right"]);
  });

  it("does not lane-change on a lean during a jump or a squat, and does after the body is upright", () => {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    const play = (script: Array<Omit<Parameters<typeof pose>[0], "time">>) => {
      let state = setNeutral(createDetector({ mirror: false, smoothingAlpha: 1 }), neutral);
      const events = [];
      let time = 0;
      for (const extra of script) {
        const update = pushPose(state, pose({ ...extra, time }));
        state = update.state;
        events.push(...update.events);
        time += 33;
      }
      return events.map((event) => event.movementType);
    };
    const repeat = (count: number, extra: Omit<Parameters<typeof pose>[0], "time">) => Array.from({ length: count }, () => extra);

    expect(
      play([
        ...repeat(3, {}),
        { hipDrop: 0.08, shoulderLean: -clear },
        { rise: 0.1, shoulderLean: -clear },
        { rise: 0.1, shoulderLean: -clear },
        ...repeat(4, { shoulderLean: -clear }),
        ...repeat(4, {}),
        ...repeat(4, { shoulderLean: -clear }),
      ]),
    ).toEqual(["jump", "lean_left"]);

    expect(
      play([
        ...repeat(2, {}),
        ...repeat(5, { hipDrop: 0.22, shoulderLean: clear }),
        ...repeat(5, {}),
        ...repeat(4, { shoulderLean: clear }),
      ]),
    ).toEqual(["squat", "lean_right"]);
  });

  it("keeps physical left after the selfie mirror and ignores a dropped shoulder frame", () => {
    const mirroredLeft = feed(8, (index) => pose({ time: index * 33, shoulderLean: index >= 2 ? clear : 0 }), true);
    expect(mirroredLeft.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    const mirroredRight = feed(8, (index) => pose({ time: index * 33, shoulderLean: index >= 2 ? -clear : 0 }), true);
    expect(mirroredRight.events.map((event) => event.movementType)).toEqual(["lean_right"]);

    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false, smoothingAlpha: 1 }), neutral);
    const events = [];
    for (let index = 0; index < 8; index += 1) {
      const leaning = index >= 2;
      const update = pushPose(
        state,
        pose({
          time: index * 33,
          shoulderLean: leaning ? -clear : 0,
          hide: index === 3 ? [11, 12] : [],
        }),
      );
      state = update.state;
      events.push(...update.events);
    }
    expect(events.map((event) => event.movementType)).toEqual(["lean_left"]);
    expect(events[0]?.clientTimestamp).toBe(2 * 33);

    const hole = feed(8, (index) =>
      pose({
        time: index * 33,
        shoulderLean: index === 3 ? -clear : 0,
        hide: index === 3 ? [23, 24] : [],
      }),
    );
    expect(hole.events).toHaveLength(0);

    const dim = feed(8, (index) => pose({ time: index * 33, shoulderLean: index >= 2 ? -clear : 0, visibility: 0.5 }));
    expect(dim.events).toHaveLength(0);
  });
});

describe("pre-jump knee bend versus squat", () => {
  const frame = 33;

  function play(steps: Array<Omit<Parameters<typeof pose>[0], "time"> & { n?: number }>) {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false, smoothingAlpha: 1 }), neutral);
    const events = [];
    let time = 0;
    for (const step of steps) {
      const count = step.n ?? 1;
      for (let index = 0; index < count; index += 1) {
        const update = pushPose(state, pose({ ...step, time }));
        state = update.state;
        events.push(...update.events);
        time += frame;
      }
    }
    return { state, events };
  }

  it("keeps the squat gate and watches an ambiguous dip inside 120–200ms", () => {
    expect(DEFAULT_THRESHOLDS.squatEnterDrop).toBe(0.1);
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    expect(DEFAULT_THRESHOLDS.dipClassifyMs).toBeGreaterThanOrEqual(120);
    expect(DEFAULT_THRESHOLDS.dipClassifyMs).toBeLessThanOrEqual(200);
    expect(DEFAULT_THRESHOLDS.jumpPrepMaxDrop).toBeGreaterThan(DEFAULT_THRESHOLDS.squatEnterDrop);
  });

  it("emits one jump and no squat when a slight knee bend rises", () => {
    const { events } = play([
      { n: 3 },
      { n: 3, hipDrop: 0.05, kneeForward: 0.08 },
      { n: 2, rise: 0.06, kneeForward: 0.02 },
      { n: 6 },
    ]);
    expect(events.map((event) => event.movementType)).toEqual(["jump"]);
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
    expect(new Set(events.map((event) => event.eventId)).size).toBe(1);
  });

  it("emits one jump without a deep knee bend", () => {
    const { events } = play([
      { n: 3 },
      { hipDrop: 0.012, kneeForward: 0.02 },
      { n: 2, rise: 0.05, kneeForward: 0.02 },
      { n: 4 },
    ]);
    expect(events.map((event) => event.movementType)).toEqual(["jump"]);
  });

  it("emits one deep squat and does not jump on the way up", () => {
    const { events } = play([
      { n: 2 },
      { n: 6, hipDrop: 0.22, kneeForward: 0.1 },
      { n: 6 },
    ]);
    expect(events.map((event) => event.movementType)).toEqual(["squat"]);
  });

  it("emits one shallow squat when the lowered posture is held", () => {
    const moderate = play([
      { n: 2 },
      { n: 4, hipDrop: 0.024 },
      { n: 4 },
    ]);
    expect(moderate.events.map((event) => event.movementType)).toEqual(["squat"]);

    const held = play([
      { n: 2 },
      { n: 8, hipDrop: 0.03, kneeForward: 0.06 },
      { n: 4 },
    ]);
    expect(held.events.filter((event) => event.movementType === "squat")).toHaveLength(1);
    expect(held.events.filter((event) => event.movementType === "jump")).toHaveLength(0);
    const squatAt = held.events[0]?.clientTimestamp ?? 0;
    expect(squatAt - 2 * frame).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.dipClassifyMs);
  });

  it("does not squat when the knees bend on landing", () => {
    const { events } = play([
      { n: 3 },
      { n: 2, hipDrop: 0.03, kneeForward: 0.06 },
      { n: 2, rise: 0.06, kneeForward: 0.02 },
      { n: 3, hipDrop: 0.05, kneeForward: 0.08 },
      { n: 6 },
    ]);
    expect(events.map((event) => event.movementType)).toEqual(["jump"]);
  });

  it("emits nothing for running in place", () => {
    const { events } = play(Array.from({ length: 16 }, (_, index) => ({ hipDrop: index % 2 === 0 ? 0 : 0.04 })));
    expect(events).toHaveLength(0);
  });

  it("emits nothing when a slight bend returns to stand without a rise", () => {
    const { events } = play([
      { n: 3 },
      { n: 2, hipDrop: 0.05, kneeForward: 0.08 },
      { n: 6 },
    ]);
    expect(events).toHaveLength(0);
  });

  it("emits two jumps after the body is neutral between them", () => {
    const { events } = play([
      { n: 3 },
      { n: 2, hipDrop: 0.03, kneeForward: 0.06 },
      { n: 2, rise: 0.05, kneeForward: 0.02 },
      { n: 8 },
      { n: 2, hipDrop: 0.03, kneeForward: 0.06 },
      { n: 2, rise: 0.05, kneeForward: 0.02 },
      { n: 4 },
    ]);
    const jumps = events.filter((event) => event.movementType === "jump");
    expect(jumps).toHaveLength(2);
    expect(jumps[0]?.eventId).not.toBe(jumps[1]?.eventId);
    expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
  });

  it("emits a squat and then a jump, once each", () => {
    const { events } = play([
      { n: 2 },
      { n: 5, hipDrop: 0.22, kneeForward: 0.1 },
      { n: 8 },
      { n: 2, hipDrop: 0.03, kneeForward: 0.06 },
      { n: 2, rise: 0.05, kneeForward: 0.02 },
      { n: 4 },
    ]);
    expect(events.map((event) => event.movementType)).toEqual(["squat", "jump"]);
    expect(events[0]?.eventId).not.toBe(events[1]?.eventId);
  });

  it("emits nothing from partial landmarks or low confidence", () => {
    const hidden = play([
      { n: 2 },
      { n: 4, hipDrop: 0.2, hide: [23, 24] },
      { n: 2 },
    ]);
    expect(hidden.events).toHaveLength(0);

    const dim = play([
      { n: 2 },
      { n: 4, hipDrop: 0.2, visibility: 0.2 },
      { n: 2 },
    ]);
    expect(dim.events).toHaveLength(0);

    const noFeet = play([
      { n: 2 },
      { n: 3, hipDrop: 0.05, kneeForward: 0.08, hide: [27, 28] },
      { n: 2, rise: 0.06, hide: [27, 28] },
    ]);
    expect(noFeet.events.filter((event) => event.movementType === "squat")).toHaveLength(0);
  });
});

describe("synthetic gesture counts at variable frame intervals", () => {
  const wobble = [0.72, 1.18, 0.86, 1.28, 0.94, 1.06];

  function playSteps(steps: Array<Omit<Parameters<typeof pose>[0], "time"> & { n?: number }>, frameMs: number) {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false }), neutral);
    const events = [];
    let time = 0;
    let tick = 0;
    for (const step of steps) {
      const count = step.n ?? 1;
      for (let index = 0; index < count; index += 1) {
        const update = pushPose(state, pose({ ...step, time }));
        state = update.state;
        events.push(...update.events);
        tick += 1;
        time += Math.max(8, Math.round(frameMs * wobble[tick % wobble.length]!));
      }
    }
    return events;
  }

  function countKind(frameMs: number, kind: "jump" | "squat" | "lean_left" | "lean_right") {
    const repeats = 20;
    const steps: Array<Omit<Parameters<typeof pose>[0], "time"> & { n?: number }> = [];
    for (let index = 0; index < repeats; index += 1) {
      if (kind === "jump") {
        steps.push({ n: 3 }, { hipDrop: 0.012, kneeForward: 0.02 }, { n: 2, rise: 0.05, kneeForward: 0.02 }, { n: 6 });
      } else if (kind === "squat") {
        steps.push({ n: 2 }, { n: 8, hipDrop: 0.22, kneeForward: 0.1 }, { n: 6 });
      } else if (kind === "lean_left") {
        steps.push({ n: 2 }, { n: 4, shoulderLean: -0.045 }, { n: 5 });
      } else {
        steps.push({ n: 2 }, { n: 4, shoulderLean: 0.045 }, { n: 5 });
      }
    }
    const events = playSteps(steps, frameMs);
    return events.filter((event) => event.movementType === kind).length;
  }

  it("logs synthetic emit counts at 30fps and 15fps", () => {
    const rates = [33, 66];
    const kinds = ["jump", "squat", "lean_left", "lean_right"] as const;
    const rows = rates.flatMap((frameMs) => kinds.map((kind) => ({ frameMs, kind, emitted: countKind(frameMs, kind) })));
    console.log(JSON.stringify({ synthetic: true, rows }));
    for (const row of rows) expect(row.emitted).toBe(20);
  });

  it("chains squat, jump, and lane at 30fps and at 15fps", () => {
    for (const frameMs of [33, 66]) {
      const squatThenJump = playSteps(
        [{ n: 2 }, { n: 8, hipDrop: 0.22, kneeForward: 0.1 }, { n: 8 }, { hipDrop: 0.012, kneeForward: 0.02 }, { n: 2, rise: 0.05, kneeForward: 0.02 }, { n: 4 }],
        frameMs,
      );
      expect(squatThenJump.map((event) => event.movementType)).toEqual(["squat", "jump"]);

      const jumpThenSquat = playSteps(
        [{ n: 3 }, { hipDrop: 0.012, kneeForward: 0.02 }, { n: 2, rise: 0.05, kneeForward: 0.02 }, { n: 8 }, { n: 8, hipDrop: 0.22, kneeForward: 0.1 }, { n: 6 }],
        frameMs,
      );
      expect(jumpThenSquat.map((event) => event.movementType)).toEqual(["jump", "squat"]);

      const laneThenJump = playSteps(
        [{ n: 2 }, { n: 4, shoulderLean: -0.045 }, { n: 6 }, { hipDrop: 0.012, kneeForward: 0.02 }, { n: 2, rise: 0.05, kneeForward: 0.02 }, { n: 4 }],
        frameMs,
      );
      expect(laneThenJump.map((event) => event.movementType)).toEqual(["lean_left", "jump"]);

      const jumpThenLane = playSteps(
        [{ n: 3 }, { hipDrop: 0.012, kneeForward: 0.02 }, { n: 2, rise: 0.05, kneeForward: 0.02 }, { n: 8 }, { n: 4, shoulderLean: 0.045 }, { n: 3 }],
        frameMs,
      );
      expect(jumpThenLane.map((event) => event.movementType)).toEqual(["jump", "lean_right"]);
    }
  });

  it("keeps a rise that arrives on a slow camera gap", () => {
    expect(MAX_VELOCITY_GAP_MS).toBe(1200);
    expect(neutralDriftForGap(0.02, 0)).toBe(0);
    expect(neutralDriftForGap(0.02, 1000 / 30)).toBeCloseTo(0.02, 5);
    expect(neutralDriftForGap(0.02, 2000 / 30)).toBeGreaterThan(0.03);
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false, smoothingAlpha: 1 }), neutral);
    const events = [];
    for (const frame of [{ time: 0 }, { time: 40 }, { time: 740, rise: 0.06, kneeForward: 0.02 }]) {
      const update = pushPose(state, pose(frame));
      state = update.state;
      events.push(...update.events);
    }
    expect(events.map((event) => event.movementType)).toEqual(["jump"]);
  });

  it("emits jump, squat, left, and right on one video-timestamp sequence at 15fps and 30fps", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    expect(DEFAULT_THRESHOLDS.squatEnterDrop).toBe(0.1);
    expect(DEFAULT_THRESHOLDS.torsoLeanEnter).toBe(0.16);
    const round: Array<Omit<Parameters<typeof pose>[0], "time"> & { n?: number }> = [
      { n: 3 },
      { hipDrop: 0.012, kneeForward: 0.02 },
      { n: 2, rise: 0.05, kneeForward: 0.02 },
      { n: 2, hipDrop: 0.08, kneeForward: 0.08 },
      { n: 8 },
      { n: 8, hipDrop: 0.22, kneeForward: 0.1 },
      { n: 8 },
      { n: 4, shoulderLean: -0.045 },
      { n: 6, shoulderLean: -0.045 },
      { n: 6 },
      { n: 4, shoulderLean: 0.045 },
      { n: 6, shoulderLean: 0.045 },
      { n: 6 },
      { n: 4, armsOut: true },
      { n: 4 },
    ];
    for (const frameMs of [33, 66]) {
      const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
      if (!neutral) throw new Error("Failed to build a neutral pose");
      let state = setNeutral(createDetector({ mirror: false }), neutral);
      const events = [];
      let time = 0;
      let firstRiseAt: number | null = null;
      for (const step of [...round, ...round]) {
        const count = step.n ?? 1;
        for (let index = 0; index < count; index += 1) {
          if (step.rise && firstRiseAt === null) firstRiseAt = time;
          const update = pushPose(state, pose({ ...step, time }));
          state = update.state;
          events.push(...update.events);
          time += frameMs;
        }
      }
      expect(events.map((event) => event.movementType)).toEqual([
        "jump",
        "squat",
        "lean_left",
        "lean_right",
        "jump",
        "squat",
        "lean_left",
        "lean_right",
      ]);
      expect(events[0]?.clientTimestamp).toBe(firstRiseAt);
      expect(new Set(events.map((event) => event.eventId)).size).toBe(events.length);
    }
  });
});

describe("synthetic small-hop takeoff", () => {
  const rawDelta = 0.002244;
  const torso = 0.2;

  function play(frames: PoseFrame[]) {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false }), neutral);
    const events = [];
    for (const frame of frames) {
      const update = pushPose(state, frame);
      state = update.state;
      events.push(...update.events);
    }
    return { state, events };
  }

  function edgeHop(frameMs: number, extra: Partial<Parameters<typeof pose>[0]> = {}) {
    return play(
      Array.from({ length: 10 }, (_, index) => {
        const dip = index === 3 || index === 4;
        return pose({
          time: 20_000 + index * frameMs,
          hipDrop: dip || index === 5 ? 0.03 : 0,
          rise: index === 5 ? rawDelta : 0,
          ...extra,
        });
      }),
    );
  }

  it("synthetic: documents the 66ms hop that was under jumpRise and is now one jump", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    expect(DEFAULT_THRESHOLDS.squatEnterDrop).toBe(0.1);
    expect(DEFAULT_THRESHOLDS.torsoLeanEnter).toBe(0.16);
    expect(DEFAULT_THRESHOLDS.torsoLeanNeutral).toBe(0.07);
    expect(DEFAULT_THRESHOLDS.dipClassifyMs).toBe(160);
    expect(JUMP_RISE_DISPLACEMENT).toBe(0.011);
    const at30 = rawDelta / 0.033 / torso;
    const at15 = rawDelta / 0.066 / torso;
    expect(at30).toBeCloseTo(0.34, 2);
    expect(at15).toBeCloseTo(0.17, 2);
    expect(at30).toBeGreaterThan(DEFAULT_THRESHOLDS.jumpRise);
    expect(at15).toBeLessThan(DEFAULT_THRESHOLDS.jumpRise);
    expect(rawDelta / torso).toBeGreaterThan(JUMP_RISE_DISPLACEMENT);
    expect(0.002 / torso).toBeLessThan(JUMP_RISE_DISPLACEMENT);

    const slow = edgeHop(66);
    expect(slow.events.map((event) => event.movementType)).toEqual(["jump"]);
    expect(new Set(slow.events.map((event) => event.eventId)).size).toBe(1);
    const fast = edgeHop(33);
    expect(fast.events.map((event) => event.movementType)).toEqual(["jump"]);
  });

  it("synthetic: a normal jump, a slight knee bend, and straight knees are one jump and not a squat", () => {
    const normal = play(
      Array.from({ length: 12 }, (_, index) =>
        pose({
          time: index * 33,
          hipDrop: index === 3 ? 0.02 : 0,
          rise: index === 4 ? 0.05 : 0,
          kneeForward: 0.02,
        }),
      ),
    );
    expect(normal.events.map((event) => event.movementType)).toEqual(["jump"]);

    const bent = edgeHop(66, { kneeForward: 0.06 });
    expect(bent.events.map((event) => event.movementType)).toEqual(["jump"]);

    const straight = edgeHop(66, { straightKnees: true });
    expect(straight.events.map((event) => event.movementType)).toEqual(["jump"]);
  });

  it("synthetic: squat then one small jump, then a lane at the old lean line then one jump", () => {
    const frame = 66;
    const squatThenJump = play([
      ...Array.from({ length: 2 }, (_, index) => pose({ time: index * frame })),
      ...Array.from({ length: 8 }, (_, index) => pose({ time: (2 + index) * frame, hipDrop: 0.22, kneeForward: 0.1 })),
      ...Array.from({ length: 8 }, (_, index) => pose({ time: (10 + index) * frame })),
      ...Array.from({ length: 10 }, (_, index) => {
        const dip = index === 3 || index === 4;
        return pose({
          time: (18 + index) * frame,
          hipDrop: dip || index === 5 ? 0.03 : 0,
          rise: index === 5 ? rawDelta : 0,
        });
      }),
    ]);
    expect(squatThenJump.events.map((event) => event.movementType)).toEqual(["squat", "jump"]);

    const laneThenJump = play([
      ...Array.from({ length: 2 }, (_, index) => pose({ time: index * frame })),
      ...Array.from({ length: 4 }, (_, index) => pose({ time: (2 + index) * frame, shoulderLean: -0.045 })),
      ...Array.from({ length: 6 }, (_, index) => pose({ time: (6 + index) * frame })),
      ...Array.from({ length: 10 }, (_, index) => {
        const dip = index === 3 || index === 4;
        return pose({
          time: (12 + index) * frame,
          hipDrop: dip || index === 5 ? 0.03 : 0,
          rise: index === 5 ? rawDelta : 0,
        });
      }),
    ]);
    expect(laneThenJump.events.map((event) => event.movementType)).toEqual(["lean_left", "jump"]);
    expect(DEFAULT_THRESHOLDS.torsoLeanEnter).toBe(0.16);
  });

  it("synthetic: repeated hops emit one each, landing knees do not squat, tiptoes and running and a 2mm shake do not jump", () => {
    const repeated = play(
      [0, 1].flatMap((hop) =>
        Array.from({ length: 14 }, (_, index) => {
          const dip = index === 3 || index === 4;
          return pose({
            time: hop * 14 * 66 + index * 66,
            hipDrop: dip || index === 5 ? 0.03 : 0,
            rise: index === 5 ? rawDelta : 0,
          });
        }),
      ),
    );
    const jumps = repeated.events.filter((event) => event.movementType === "jump");
    expect(jumps).toHaveLength(2);
    expect(jumps[0]?.eventId).not.toBe(jumps[1]?.eventId);
    expect(repeated.events.filter((event) => event.movementType === "squat")).toHaveLength(0);

    const landing = play([
      ...Array.from({ length: 3 }, (_, index) => pose({ time: index * 33 })),
      pose({ time: 99, hipDrop: 0.02, kneeForward: 0.04 }),
      pose({ time: 132, rise: 0.02, kneeForward: 0.02 }),
      pose({ time: 165, rise: 0.03, kneeForward: 0.08 }),
      pose({ time: 198, hipDrop: 0.04, kneeForward: 0.1 }),
      pose({ time: 231, hipDrop: 0.02, kneeForward: 0.06 }),
      ...Array.from({ length: 6 }, (_, index) => pose({ time: 264 + index * 33 })),
    ]);
    expect(landing.events.map((event) => event.movementType)).toEqual(["jump"]);

    const tiptoes = play(Array.from({ length: 12 }, (_, index) => pose({ time: index * 66, rise: Math.min(0.012, index * 0.001) })));
    expect(tiptoes.events).toHaveLength(0);

    const running = play(Array.from({ length: 16 }, (_, index) => pose({ time: index * 66, hipDrop: index % 2 === 0 ? 0 : 0.008 })));
    expect(running.events).toHaveLength(0);

    const shake = play(Array.from({ length: 12 }, (_, index) => pose({ time: index * 33, rise: index % 2 === 0 ? 0 : 0.002 })));
    expect(shake.events).toHaveLength(0);
  });

  it("synthetic: missing ankles still jump, low confidence emits nothing, and upward image motion is positive speed", () => {
    const hidden = edgeHop(66, { hide: [27, 28] });
    expect(hidden.events.map((event) => event.movementType)).toEqual(["jump"]);

    const dim = edgeHop(66, { visibility: 0.2 });
    expect(dim.events).toHaveLength(0);

    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false }), neutral);
    let hipVelocity = 0;
    for (let index = 0; index < 4; index += 1) {
      const update = pushPose(state, pose({ time: index * 33, rise: index === 3 ? rawDelta : 0 }));
      state = update.state;
      if (index === 3) hipVelocity = update.signals?.hipVelocity ?? 0;
    }
    expect(hipVelocity).toBeGreaterThan(0);
    let down = setNeutral(createDetector({ mirror: false }), neutral);
    let downVelocity = 0;
    for (let index = 0; index < 4; index += 1) {
      const update = pushPose(down, pose({ time: index * 33, rise: index === 3 ? -rawDelta : 0 }));
      down = update.state;
      if (index === 3) downVelocity = update.signals?.hipVelocity ?? 0;
    }
    expect(downVelocity).toBeLessThan(0);
  });
});

describe("same-frame jump and partial lane re-arm", () => {
  function play(frames: PoseFrame[], smoothingAlpha = 1) {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false, smoothingAlpha }), neutral);
    const events = [];
    for (const frame of frames) {
      const update = pushPose(state, frame);
      state = update.state;
      events.push(...update.events);
    }
    return { state, events };
  }

  function hopFrames(start: number, frameMs: number) {
    return Array.from({ length: 8 }, (_, index) => {
      const dip = index === 3 || index === 4;
      return pose({
        time: start + index * frameMs,
        hipDrop: dip || index === 5 ? 0.03 : 0,
        rise: index === 5 ? 0.002244 : 0,
      });
    });
  }

  it("emits the jump on the rise sample at 15fps and 30fps, not 160ms later", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    expect(DEFAULT_THRESHOLDS.dipClassifyMs).toBe(160);
    expect(JUMP_RISE_WINDOW_MS).toBe(220);
    for (const frameMs of [33, 66]) {
      const frames = hopFrames(1_000, frameMs);
      const riseAt = 1_000 + 5 * frameMs;
      const played = play(frames);
      const jump = played.events.find((event) => event.movementType === "jump");
      expect(jump?.clientTimestamp).toBe(riseAt);
      expect((jump?.clientTimestamp ?? 0) - riseAt).toBeLessThan(DEFAULT_THRESHOLDS.dipClassifyMs);
      expect(played.events.filter((event) => event.movementType === "squat")).toHaveLength(0);
    }
  });

  it("emits a second small hop after landing and a brief neutral", () => {
    for (const frameMs of [33, 66]) {
      const first = hopFrames(0, frameMs);
      const gap = Array.from({ length: 4 }, (_, index) => pose({ time: first.length * frameMs + index * frameMs }));
      const secondStart = (first.length + gap.length) * frameMs;
      const second = hopFrames(secondStart, frameMs);
      const played = play([...first, ...gap, ...second]);
      const jumps = played.events.filter((event) => event.movementType === "jump");
      expect(jumps).toHaveLength(2);
      expect(jumps[1]?.clientTimestamp).toBe(secondStart + 5 * frameMs);
      expect(played.events.filter((event) => event.movementType === "squat")).toHaveLength(0);
    }
  });

  it("documents the split rise that 120ms missed and 220ms accepts", () => {
    const torso = 0.2;
    const step = 0.0014;
    const low = 0.53;
    const mid = low - step;
    const high = mid - step;
    const within120 = peakUpwardTravel([mid, high], torso);
    const within220 = peakUpwardTravel([low, mid, high], torso);
    expect(within120).toBeCloseTo(step / torso, 5);
    expect(within120).toBeLessThan(JUMP_RISE_DISPLACEMENT);
    expect(within220).toBeCloseTo((2 * step) / torso, 5);
    expect(within220).toBeGreaterThanOrEqual(JUMP_RISE_DISPLACEMENT);
    expect(step / 0.09 / torso).toBeLessThan(DEFAULT_THRESHOLDS.jumpRise);

    const played = play([
      pose({ time: 0 }),
      pose({ time: 40 }),
      pose({ time: 100, hipDrop: 0.03 }),
      pose({ time: 190, hipDrop: 0.03, rise: step }),
      pose({ time: 280, hipDrop: 0.03, rise: step * 2 }),
      pose({ time: 360 }),
      pose({ time: 440 }),
    ]);
    const jump = played.events.find((event) => event.movementType === "jump");
    expect(jump?.clientTimestamp).toBe(280);
    expect(played.events.filter((event) => event.movementType === "jump")).toHaveLength(1);
    expect(played.events.filter((event) => event.movementType === "squat")).toHaveLength(0);
  });

  it("re-arms a lean after a partial return, holds once, ignores both arms, and still squats a held 0.10 drop", () => {
    expect(torsoLeanReleaseLine(0.16, 0.07)).toBeCloseTo(0.115, 5);
    expect(DEFAULT_THRESHOLDS.torsoLeanEnter).toBe(0.16);
    expect(DEFAULT_THRESHOLDS.torsoLeanNeutral).toBe(0.07);
    expect(DEFAULT_THRESHOLDS.squatEnterDrop).toBe(0.1);

    const lean = -0.032;
    const partial = -0.02;
    const played = play([
      ...Array.from({ length: 2 }, (_, index) => pose({ time: index * 33 })),
      ...Array.from({ length: 3 }, (_, index) => pose({ time: (2 + index) * 33, shoulderLean: lean })),
      ...Array.from({ length: 3 }, (_, index) => pose({ time: (5 + index) * 33, shoulderLean: partial })),
      ...Array.from({ length: 3 }, (_, index) => pose({ time: (8 + index) * 33, shoulderLean: lean })),
    ]);
    expect(played.events.map((event) => event.movementType)).toEqual(["lean_left", "lean_left"]);
    expect(played.events[0]?.clientTimestamp).toBe(2 * 33);
    expect(played.events[1]?.clientTimestamp).toBe(8 * 33);

    const held = play(Array.from({ length: 10 }, (_, index) => pose({ time: index * 66, shoulderLean: index >= 2 ? lean : 0 })));
    expect(held.events.map((event) => event.movementType)).toEqual(["lean_left"]);

    const arms = play(Array.from({ length: 8 }, (_, index) => pose({ time: index * 33, armsOut: index >= 2 })));
    expect(arms.events).toHaveLength(0);

    const squat = play(Array.from({ length: 8 }, (_, index) => pose({ time: index * 33, hipDrop: index >= 2 && index < 6 ? 0.024 : 0 })));
    expect(squat.events.map((event) => event.movementType)).toEqual(["squat"]);
  });

  it("emits a qualifying rise on that sample, squats a held ambiguous dip without jumping on the stand, and re-arms after a short stand", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    expect(DEFAULT_THRESHOLDS.squatEnterDrop).toBe(0.1);
    expect(DEFAULT_THRESHOLDS.torsoLeanEnter).toBe(0.16);
    expect(DEFAULT_THRESHOLDS.smoothingAlpha).toBe(0.92);
    expect(DEFAULT_THRESHOLDS.dipClassifyMs).toBe(160);
    expect(JUMP_RISE_DISPLACEMENT).toBe(0.011);
    expect(JUMP_RISE_WINDOW_MS).toBe(220);

    const frame = 33;
    const firstRise = 5 * frame;
    const first = hopFrames(0, frame);
    const played = play(first);
    const jump = played.events.find((event) => event.movementType === "jump");
    expect(jump?.clientTimestamp).toBe(firstRise);
    expect((jump?.clientTimestamp ?? 0) - firstRise).toBe(0);

    const heldDip = play([
      ...Array.from({ length: 3 }, (_, index) => pose({ time: index * 40 })),
      ...Array.from({ length: 8 }, (_, index) => pose({ time: 120 + index * 40, hipDrop: 0.024 })),
      ...Array.from({ length: 4 }, (_, index) => pose({ time: 440 + index * 40 })),
    ]);
    const squats = heldDip.events.filter((event) => event.movementType === "squat");
    expect(squats).toHaveLength(1);
    expect(heldDip.events.filter((event) => event.movementType === "jump")).toHaveLength(0);
    expect((squats[0]?.clientTimestamp ?? 0) - 120).toBeLessThanOrEqual(DEFAULT_THRESHOLDS.dipClassifyMs + 40);

    // Takeoff leaves the hips up. The next sample is still up, but slower than jumpRise,
    // while the 220ms window still contains the rise. That bob must not hold the latch.
    // One stand, then the next dip, emits on the second rise sample.
    const takeoff = [
      pose({ time: 0 }),
      pose({ time: frame }),
      pose({ time: 2 * frame }),
      pose({ time: 3 * frame, hipDrop: 0.03 }),
      pose({ time: 4 * frame, hipDrop: 0.03 }),
      pose({ time: 5 * frame, rise: 0.008 }),
    ];
    const secondRise = 10 * frame;
    const chained = play([
      ...takeoff,
      pose({ time: 6 * frame, rise: 0.0082 }),
      pose({ time: 7 * frame }),
      pose({ time: 8 * frame, hipDrop: 0.03 }),
      pose({ time: 9 * frame, hipDrop: 0.03 }),
      pose({ time: secondRise, hipDrop: 0.03, rise: 0.002244 }),
    ]);
    expect(chained.events.filter((event) => event.movementType === "jump").map((event) => event.clientTimestamp)).toEqual([
      5 * frame,
      secondRise,
    ]);
    expect(chained.events.filter((event) => event.movementType === "squat")).toHaveLength(0);
  });

  it("emits left and right once at the 0.16 lean, holds, and re-arms at the 0.115 midpoint", () => {
    expect(torsoLeanReleaseLine(0.16, 0.07)).toBeCloseTo(0.115, 5);
    expect(DEFAULT_THRESHOLDS.torsoLeanEnter).toBe(0.16);
    const left = play([
      ...Array.from({ length: 2 }, (_, index) => pose({ time: index * 33 })),
      ...Array.from({ length: 4 }, (_, index) => pose({ time: (2 + index) * 33, shoulderLean: -0.032 })),
    ]);
    expect(left.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    expect(left.events[0]?.clientTimestamp).toBe(2 * 33);

    const right = play([
      ...Array.from({ length: 2 }, (_, index) => pose({ time: index * 33 })),
      ...Array.from({ length: 3 }, (_, index) => pose({ time: (2 + index) * 33, shoulderLean: 0.032 })),
      ...Array.from({ length: 3 }, (_, index) => pose({ time: (5 + index) * 33, shoulderLean: 0.02 })),
      ...Array.from({ length: 3 }, (_, index) => pose({ time: (8 + index) * 33, shoulderLean: 0.032 })),
    ]);
    expect(right.events.map((event) => event.movementType)).toEqual(["lean_right", "lean_right"]);
    expect(right.events[0]?.clientTimestamp).toBe(2 * 33);
    expect(right.events[1]?.clientTimestamp).toBe(8 * 33);
  });

  it("ignores a stale frame that arrives after a newer frame", () => {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false, smoothingAlpha: 1 }), neutral);
    state = pushPose(state, pose({ time: 500 })).state;
    const stale = pushPose(state, pose({ time: 400, shoulderLean: -0.032 }));
    expect(stale.events).toHaveLength(0);
    expect(stale.state.lastTimestamp).toBe(500);
    const fresh = pushPose(stale.state, pose({ time: 533, shoulderLean: -0.032 }));
    expect(fresh.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    expect(fresh.events[0]?.clientTimestamp).toBe(533);
  });

  it("keeps physical left on the left after the selfie mirror", () => {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: true, smoothingAlpha: 1 }), neutral);
    const events = [];
    for (let index = 0; index < 6; index += 1) {
      const update = pushPose(state, pose({ time: index * 33, shoulderLean: index >= 2 ? 0.045 : 0 }));
      state = update.state;
      events.push(...update.events);
    }
    expect(events.map((event) => event.movementType)).toEqual(["lean_left"]);
    expect(events[0]?.clientTimestamp).toBe(2 * 33);
  });
});

describe("camera onset without the extra waits", () => {
  function play(frames: PoseFrame[]) {
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    let state = setNeutral(createDetector({ mirror: false, smoothingAlpha: DEFAULT_THRESHOLDS.smoothingAlpha }), neutral);
    const events = [];
    for (const frame of frames) {
      const update = pushPose(state, frame);
      state = update.state;
      events.push(...update.events);
    }
    return { events };
  }

  it("emits a qualifying jump on the rise frame, not after dipClassifyMs", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    expect(DEFAULT_THRESHOLDS.smoothingAlpha).toBe(0.92);
    expect(DEFAULT_THRESHOLDS.dipClassifyMs).toBe(160);
    expect(JUMP_RISE_DISPLACEMENT).toBe(0.011);
    const frame = 33;
    const riseAt = 5 * frame;
    const played = play(
      Array.from({ length: 8 }, (_, index) => {
        const dip = index === 3 || index === 4;
        return pose({
          time: index * frame,
          hipDrop: dip || index === 5 ? 0.03 : 0,
          rise: index === 5 ? 0.008 : 0,
        });
      }),
    );
    const jump = played.events.find((event) => event.movementType === "jump");
    expect(jump?.clientTimestamp).toBe(riseAt);
    expect((jump?.clientTimestamp ?? 0) - riseAt).toBe(0);
    expect(played.events.filter((event) => event.movementType === "squat")).toHaveLength(0);
  });

  it("keeps the 160ms window for a still crouch so the rise can be a jump", () => {
    expect(DEFAULT_THRESHOLDS.squatEnterDrop).toBe(0.1);
    expect(DEFAULT_THRESHOLDS.dipClassifyMs).toBe(160);
    const frame = 33;
    const played = play(Array.from({ length: 14 }, (_, index) => pose({ time: index * frame, hipDrop: index >= 2 ? 0.024 : 0 })));
    const squats = played.events.filter((event) => event.movementType === "squat");
    expect(squats).toHaveLength(1);
    expect(played.events.filter((event) => event.movementType === "jump")).toHaveLength(0);
    expect((squats[0]?.clientTimestamp ?? 0) - 2 * frame).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.dipClassifyMs);
  });

  it("emits a descending squat once two samples are past 0.10, without the extra 160ms", () => {
    const frame = 33;
    const played = play(Array.from({ length: 16 }, (_, index) => pose({ time: index * frame, hipDrop: index * 0.004 })));
    const squat = played.events.find((event) => event.movementType === "squat");
    // First sample past 0.10 is 165ms. The next descending sample emits.
    // The old (ambiguous || falling) gate waited until that dip was 160ms old.
    expect(squat?.clientTimestamp).toBe(198);
    expect((squat?.clientTimestamp ?? 0) - 165).toBe(frame);
    expect((squat?.clientTimestamp ?? 0) - 165).toBeLessThan(DEFAULT_THRESHOLDS.dipClassifyMs);
    expect(played.events.filter((event) => event.movementType === "jump")).toHaveLength(0);
    expect(played.events.filter((event) => event.movementType === "squat")).toHaveLength(1);
  });

  it("emits left and right on the frame the lean crosses 0.16, and a hold does not repeat", () => {
    expect(DEFAULT_THRESHOLDS.torsoLeanEnter).toBe(0.16);
    expect(DEFAULT_THRESHOLDS.torsoLeanHoldMs).toBe(0);
    expect(torsoLeanReleaseLine(0.16, 0.07)).toBeCloseTo(0.115, 5);
    const left = play([
      ...Array.from({ length: 2 }, (_, index) => pose({ time: index * 33 })),
      ...Array.from({ length: 6 }, (_, index) => pose({ time: (2 + index) * 33, shoulderLean: -0.032 })),
    ]);
    expect(left.events.map((event) => event.movementType)).toEqual(["lean_left"]);
    expect(left.events[0]?.clientTimestamp).toBe(2 * 33);

    const right = play([
      ...Array.from({ length: 2 }, (_, index) => pose({ time: index * 33 })),
      ...Array.from({ length: 4 }, (_, index) => pose({ time: (2 + index) * 33, shoulderLean: 0.032 })),
    ]);
    expect(right.events.map((event) => event.movementType)).toEqual(["lean_right"]);
    expect(right.events[0]?.clientTimestamp).toBe(2 * 33);

    const again = play([
      ...Array.from({ length: 2 }, (_, index) => pose({ time: index * 33 })),
      ...Array.from({ length: 3 }, (_, index) => pose({ time: (2 + index) * 33, shoulderLean: -0.032 })),
      ...Array.from({ length: 3 }, (_, index) => pose({ time: (5 + index) * 33, shoulderLean: -0.02 })),
      ...Array.from({ length: 3 }, (_, index) => pose({ time: (8 + index) * 33, shoulderLean: -0.032 })),
    ]);
    expect(again.events.map((event) => event.movementType)).toEqual(["lean_left", "lean_left"]);
    expect(again.events[1]?.clientTimestamp).toBe(8 * 33);
  });

  it("does not squat or jump a one-frame bob, landing knees, a stand-up, or both arms", () => {
    const bob = play(Array.from({ length: 8 }, (_, index) => pose({ time: index * 33, hipDrop: index === 3 ? 0.024 : 0 })));
    expect(bob.events.filter((event) => event.movementType === "squat" || event.movementType === "jump")).toHaveLength(0);

    const deepBob = play(Array.from({ length: 8 }, (_, index) => pose({ time: index * 33, hipDrop: index === 3 ? 0.2 : 0 })));
    expect(deepBob.events).toHaveLength(0);

    const landing = play([
      ...Array.from({ length: 3 }, (_, index) => pose({ time: index * 33 })),
      pose({ time: 99, hipDrop: 0.02, kneeForward: 0.04 }),
      pose({ time: 132, rise: 0.02, kneeForward: 0.02 }),
      pose({ time: 165, rise: 0.03, kneeForward: 0.08 }),
      pose({ time: 198, hipDrop: 0.04, kneeForward: 0.1 }),
      pose({ time: 231, hipDrop: 0.02, kneeForward: 0.06 }),
      ...Array.from({ length: 6 }, (_, index) => pose({ time: 264 + index * 33 })),
    ]);
    expect(landing.events.map((event) => event.movementType)).toEqual(["jump"]);

    const stand = play(Array.from({ length: 12 }, (_, index) => pose({ time: index * 60, hipDrop: index >= 2 && index < 7 ? 0.2 : 0 })));
    expect(stand.events.filter((event) => event.movementType === "squat")).toHaveLength(1);
    expect(stand.events.filter((event) => event.movementType === "jump")).toHaveLength(0);

    const arms = play(Array.from({ length: 8 }, (_, index) => pose({ time: index * 33, armsOut: index >= 2 })));
    expect(arms.events).toHaveLength(0);
  });
});
