import { describe, expect, it } from "vitest";
import { adaptThresholds, neutralFromLandmarks } from "./calibration";
import { alignLandmarkDepth, type WorldPoint } from "./depth-units";
import { classifyPose } from "./movement-classifier";
import { createDetector, pushPose, setNeutral, setThresholds } from "./movement-state-machine";
import { DEFAULT_THRESHOLDS, type DetectorState, type Landmark, type MovementDraft, type PoseFrame } from "./movement-types";

const FRAME_MS = 33;
/** Portrait phone. Normalized landmark z is on the image-width scale, so this converts it toward image y. */
const PHONE_ASPECT = 720 / 1280;

function landmark(x: number, y: number, z = 0, visibility = 1): Landmark {
  return { x, y, z, visibility };
}

/**
 * Front-camera body at 30fps. A squat bends the knees toward the camera.
 * Image x stays nearly stacked, which is what the phone landmark stream looks like.
 */
function body(options: {
  time: number;
  cx?: number;
  drop?: number;
  hipExtra?: number;
  rise?: number;
  kneeForwardZ?: number;
  kneeSpread?: number;
  /** Knee moves up in the image, so the thigh stays short while the hips rise. */
  kneeLift?: number;
  /** Shoulders drop and the hips stay. A bow, not a squat. */
  shoulderDrop?: number;
  rightRaise?: number;
  leftRaise?: number;
  /** Hand at the hip, still a little outside the calibrated hang. */
  rightHip?: boolean;
  leftHip?: boolean;
}): PoseFrame {
  const cx = options.cx ?? 0.5;
  const drop = options.drop ?? 0;
  const rise = options.rise ?? 0;
  const shoulderY = 0.3 + drop - rise + (options.shoulderDrop ?? 0);
  const hipY = 0.5 + drop + (options.hipExtra ?? 0) - rise;
  const kneeY = 0.68 + drop * 0.35 - rise * 0.15 - (options.kneeLift ?? 0);
  const ankleY = 0.88 - rise * 0.65;
  const spread = options.kneeSpread ?? 0;
  const kneeZ = -(options.kneeForwardZ ?? 0);
  const points: Landmark[] = Array.from({ length: 33 }, () => landmark(cx, 0.5, 0, 0.1));
  const set = (index: number, x: number, y: number, z = 0) => {
    points[index] = landmark(x, y, z, 1);
  };
  set(0, cx, shoulderY - 0.08);
  set(11, cx - 0.08, shoulderY);
  set(12, cx + 0.08, shoulderY);
  set(23, cx - 0.06, hipY, 0);
  set(24, cx + 0.06, hipY, 0);
  set(25, cx - 0.06 - spread, kneeY, kneeZ);
  set(26, cx + 0.06 + spread, kneeY, kneeZ);
  set(27, cx - 0.05, ankleY, 0.01);
  set(28, cx + 0.05, ankleY, 0.01);
  const arm = (side: -1 | 1, amount: number, atHip: boolean) => {
    const shoulderX = cx + side * 0.08;
    const wristX = shoulderX + side * (atHip ? 0.058 : 0.02 + amount * 0.1);
    const wristY = atHip ? shoulderY + 0.21 : shoulderY + 0.16 - amount * 0.06;
    const elbowX = shoulderX + side * (atHip ? 0.04 : 0.03 + amount * 0.02);
    const elbowY = atHip ? shoulderY + 0.12 : shoulderY + 0.09 + amount * 0.02;
    if (side < 0) {
      set(13, elbowX, elbowY);
      set(15, wristX, wristY);
    } else {
      set(14, elbowX, elbowY);
      set(16, wristX, wristY);
    }
  };
  arm(-1, options.leftRaise ?? 0, options.leftHip ?? false);
  arm(1, options.rightRaise ?? 0, options.rightHip ?? false);
  return { timestampMs: options.time, landmarks: points };
}

/**
 * Meters, hip midpoint at the origin. A squat moves the knees toward the camera.
 * Image x/y stay nearly stacked. This is the worldLandmarks array the estimator receives.
 */
function worldMeters(options: { drop?: number; kneeForwardM?: number; kneeZSign?: -1 | 1 }): Array<WorldPoint | null> {
  const fold = Math.min(1, (options.drop ?? 0) / 0.1);
  // MediaPipe: smaller z is closer to the camera. -1 is that sign. +1 is the flipped sign.
  const kneeZ = (options.kneeZSign ?? -1) * (options.kneeForwardM ?? 0.02);
  const points: Array<WorldPoint | null> = Array.from({ length: 33 }, () => null);
  const set = (index: number, x: number, y: number, z: number) => {
    points[index] = { x, y, z };
  };
  set(11, -0.18, 0.5, 0);
  set(12, 0.18, 0.5, 0);
  set(23, -0.12, 0, 0);
  set(24, 0.12, 0, 0);
  set(25, -0.12, -0.42 + fold * 0.18, kneeZ);
  set(26, 0.12, -0.42 + fold * 0.18, kneeZ);
  set(27, -0.1, -0.84 + fold * 0.34, 0.02);
  set(28, 0.1, -0.84 + fold * 0.34, 0.02);
  return points;
}

/**
 * The arrays pose-estimator feeds alignLandmarkDepth. Normalized z stays on the image-width
 * scale (here -0.02, toward the camera). World landmarks are omitted unless a small meter
 * depth is passed. This is not the 0.18m knee the older fixture used.
 */
function liveFrame(
  options: Parameters<typeof body>[0],
  depth: { kneeForwardM: number; kneeZSign?: -1 | 1 } | null = null,
): PoseFrame {
  const image = body({ ...options, kneeForwardZ: options.kneeForwardZ ?? 0.02 });
  const world = depth
    ? worldMeters({ drop: options.drop, kneeForwardM: depth.kneeForwardM, kneeZSign: depth.kneeZSign })
    : null;
  return {
    timestampMs: options.time,
    landmarks: alignLandmarkDepth(image.landmarks, world, PHONE_ASPECT),
  };
}

function startLive(cx: number, depth: { kneeForwardM: number; kneeZSign?: -1 | 1 } | null = null) {
  let state = createDetector({ mirror: false, smoothingAlpha: DEFAULT_THRESHOLDS.smoothingAlpha, cooldownMs: DEFAULT_THRESHOLDS.cooldownMs });
  const neutral = neutralFromLandmarks(liveFrame({ time: 0, cx }, depth).landmarks);
  if (!neutral) throw new Error("neutral");
  state = setNeutral(state, neutral);
  state = setThresholds(state, adaptThresholds(neutral, state.thresholds));
  return state;
}

/** Same conversion the phone estimator runs before the classifier. */
function phoneFrame(options: Parameters<typeof body>[0] & { kneeForwardM?: number }): PoseFrame {
  const image = body({ ...options, kneeForwardZ: 0.02 });
  return {
    timestampMs: options.time,
    landmarks: alignLandmarkDepth(image.landmarks, worldMeters(options), PHONE_ASPECT),
  };
}

function start(cx = 0.5, smoothingAlpha = DEFAULT_THRESHOLDS.smoothingAlpha) {
  let state = createDetector({ mirror: false, smoothingAlpha, cooldownMs: DEFAULT_THRESHOLDS.cooldownMs });
  const neutral = neutralFromLandmarks(body({ time: 0, cx }).landmarks);
  if (!neutral) throw new Error("neutral");
  state = setNeutral(state, neutral);
  state = setThresholds(state, adaptThresholds(neutral, state.thresholds));
  return state;
}

function startPhone(cx = 0.5) {
  let state = createDetector({ mirror: false, smoothingAlpha: DEFAULT_THRESHOLDS.smoothingAlpha, cooldownMs: DEFAULT_THRESHOLDS.cooldownMs });
  const neutral = neutralFromLandmarks(phoneFrame({ time: 0, cx }).landmarks);
  if (!neutral) throw new Error("neutral");
  state = setNeutral(state, neutral);
  state = setThresholds(state, adaptThresholds(neutral, state.thresholds));
  return state;
}

function run(state: DetectorState, frames: PoseFrame[]) {
  const events: MovementDraft[] = [];
  for (const frame of frames) {
    const update = pushPose(state, frame);
    state = update.state;
    events.push(...update.events);
  }
  return { state, events };
}

describe("indoor frame sequences", () => {
  it("emits one squat from a front-camera dip and does not jump on the way up", () => {
    const rawNeutral = neutralFromLandmarks(body({ time: 0, kneeForwardZ: 0.02 }).landmarks);
    const phoneNeutral = neutralFromLandmarks(phoneFrame({ time: 0 }).landmarks);
    if (!rawNeutral || !phoneNeutral) throw new Error("neutral");
    const rawBottom = classifyPose(
      body({ time: 0, drop: 0.1, kneeForwardZ: 0.02, kneeSpread: 0.01 }).landmarks,
      rawNeutral,
      DEFAULT_THRESHOLDS,
      0,
    );
    const alignedBottom = classifyPose(
      phoneFrame({ time: 0, drop: 0.1, kneeForwardM: 0.18, kneeSpread: 0.01 }).landmarks,
      phoneNeutral,
      DEFAULT_THRESHOLDS,
      0,
    );
    expect(rawBottom.kneeAngle).toBeLessThan(156);
    expect(alignedBottom.kneeAngle).toBeLessThan(156);
    expect(alignedBottom.ankleFlex).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.squatAnkleFlex);

    const timings: Record<string, unknown>[] = [];
    for (const cx of [0.28, 0.5, 0.72]) {
      let state = startPhone(cx);
      const events: MovementDraft[] = [];
      let bottom: { hipDrop: number; kneeAngle: number; kneeFlex: number; ankleFlex: number; ankleRise: number } | null = null;
      const frames: PoseFrame[] = [];
      for (let index = 0; index < 8; index += 1) {
        const progress = index / 7;
        frames.push(phoneFrame({ time: index * FRAME_MS, cx, drop: progress * 0.1, kneeForwardM: progress * 0.18, kneeSpread: progress * 0.01 }));
      }
      for (let index = 0; index < 12; index += 1) {
        frames.push(phoneFrame({ time: (8 + index) * FRAME_MS, cx, drop: 0.1, kneeForwardM: 0.18, kneeSpread: 0.01 }));
      }
      for (let index = 0; index < 8; index += 1) {
        const left = 1 - index / 7;
        frames.push(phoneFrame({ time: (20 + index) * FRAME_MS, cx, drop: 0.1 * left, kneeForwardM: 0.18 * left, kneeSpread: 0.01 * left }));
      }
      for (const frame of frames) {
        const update = pushPose(state, frame);
        state = update.state;
        events.push(...update.events);
        if (frame.timestampMs === 14 * FRAME_MS && update.signals) {
          bottom = {
            hipDrop: Number(update.signals.hipDrop.toFixed(3)),
            kneeAngle: Number(update.signals.kneeAngle.toFixed(1)),
            kneeFlex: Number(update.signals.kneeFlex.toFixed(1)),
            ankleFlex: Number(update.signals.ankleFlex.toFixed(1)),
            ankleRise: Number(update.signals.ankleRise.toFixed(3)),
          };
        }
      }
      const squats = events.filter((event) => event.movementType === "squat");
      const jumps = events.filter((event) => event.movementType === "jump");
      expect(squats).toHaveLength(1);
      expect(jumps).toHaveLength(0);
      expect(bottom).not.toBeNull();
      expect(bottom!.hipDrop).toBeGreaterThan(DEFAULT_THRESHOLDS.squatEnterDrop);
      expect(bottom!.kneeAngle).toBeLessThan(state.thresholds.squatKneeEnter);
      expect(bottom!.ankleFlex).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.squatAnkleFlex);
      expect(bottom!.ankleRise).toBeLessThan(0.04);
      const holdStart = 8 * FRAME_MS;
      timings.push({
        cx,
        squatAtMs: squats[0]?.clientTimestamp,
        msAfterHoldStart: (squats[0]?.clientTimestamp ?? 0) - holdStart,
        bottom,
        kneeEnter: state.thresholds.squatKneeEnter,
      });
    }
    console.log(JSON.stringify({
      squat: timings,
      rawKneeAngle: Number(rawBottom.kneeAngle.toFixed(1)),
      alignedKneeAngle: Number(alignedBottom.kneeAngle.toFixed(1)),
      alignedAnkleFlex: Number(alignedBottom.ankleFlex.toFixed(1)),
      squatHoldMs: DEFAULT_THRESHOLDS.squatHoldMs,
      jumpRise: DEFAULT_THRESHOLDS.jumpRise,
    }));
  });

  it("emits a second jump on the next dip after landing, including a quick one and a slightly high landing", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    const measured: Record<string, unknown>[] = [];
    for (const cx of [0.28, 0.5, 0.72]) {
      for (const kind of ["quick", "highLanding", "spaced"] as const) {
        let state = startPhone(cx);
        const events: MovementDraft[] = [];
        let groundedAt: number | null = null;
        let firstJumpAt: number | null = null;
        let peakRise = 0;
        for (let index = 0; index < (kind === "spaced" ? 48 : 28); index += 1) {
          const cycle = kind === "spaced" ? index % 24 : index;
          const dipping = kind === "quick" ? index === 4 || index === 5 || index === 14 || index === 15 : kind === "highLanding" ? index === 4 || index === 5 || index === 20 || index === 21 : cycle === 6 || cycle === 7;
          const rising = kind === "quick" ? index === 6 || index === 7 || index === 16 || index === 17 : kind === "highLanding" ? index === 6 || index === 7 || index === 23 || index === 24 : cycle === 8 || cycle === 9;
          const air = kind === "quick" ? index >= 8 && index <= 10 : kind === "highLanding" ? index >= 8 && index <= 11 : cycle >= 10 && cycle <= 14;
          const restingRise = kind === "highLanding" && !rising && !air ? 0.012 : 0;
          const update = pushPose(
            state,
            phoneFrame({
              time: index * FRAME_MS,
              cx,
              hipExtra: dipping ? 0.045 : 0,
              kneeForwardM: dipping ? 0.12 : 0.02,
              kneeSpread: dipping ? 0.01 : 0.005,
              rise: rising ? 0.012 : air ? 0.02 : restingRise,
            }),
          );
          state = update.state;
          peakRise = Math.max(peakRise, update.signals?.hipVelocity ?? 0, update.signals?.riseSpeed ?? 0);
          events.push(...update.events);
          const jumps = events.filter((event) => event.movementType === "jump");
          if (jumps.length === 1 && firstJumpAt === null) firstJumpAt = jumps[0]!.clientTimestamp;
          if (firstJumpAt !== null && groundedAt === null && state.jump.phase === "NEUTRAL" && state.phase !== "JUMPING") groundedAt = index * FRAME_MS;
        }
        const jumps = events.filter((event) => event.movementType === "jump");
        expect(jumps.map((event) => event.movementType)).toEqual(["jump", "jump"]);
        expect(jumps[0]?.eventId).not.toBe(jumps[1]?.eventId);
        expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
        const secondAt = jumps[1]?.clientTimestamp ?? 0;
        const rearmMs = groundedAt === null ? null : secondAt - groundedAt;
        expect(rearmMs).not.toBeNull();
        if (kind === "quick") expect(rearmMs!).toBeLessThan(400);
        expect(peakRise).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.jumpRise);
        measured.push({ cx, kind, firstJumpAt, groundedAt, secondAt, rearmMs, peakRise: Number(peakRise.toFixed(2)) });
      }
    }
    console.log(JSON.stringify({ jumps: measured }));
  });

  it("fires the next lane change once the hand is down at the hip, without a long lock", () => {
    const measured: Record<string, unknown>[] = [];
    for (const cx of [0.28, 0.5, 0.72]) {
      let state = start(cx);
      const events: MovementDraft[] = [];
      let releasedAt: number | null = null;
      let sawFirst = false;
      for (let index = 0; index < 32; index += 1) {
        const raising = index >= 2 && index <= 6;
        const holding = index > 6 && index <= 10;
        const lowering = index > 10 && index <= 16;
        const again = index > 16;
        const raise = raising ? (index - 2) / 4 : holding || (again && index < 22) ? 1 : again ? 1 : 0;
        const atHip = lowering || (again && index <= 16);
        const update = pushPose(state, body({ time: index * FRAME_MS, cx, rightRaise: atHip ? 0 : raise, rightHip: atHip }));
        state = update.state;
        if (update.events.some((event) => event.movementType === "lean_right")) sawFirst = true;
        if (sawFirst && releasedAt === null && state.right.phase === "NEUTRAL") releasedAt = index * FRAME_MS;
        events.push(...update.events);
      }
      const rights = events.filter((event) => event.movementType === "lean_right");
      expect(rights).toHaveLength(2);
      expect(releasedAt).not.toBeNull();
      const afterReleaseMs = (rights[1]?.clientTimestamp ?? 0) - (releasedAt ?? 0);
      expect(afterReleaseMs).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.armHoldMs - FRAME_MS);
      expect(afterReleaseMs).toBeLessThan(400);
      measured.push({ cx, releasedAt, secondAt: rights[1]?.clientTimestamp, afterReleaseMs });
    }
    console.log(JSON.stringify({ laneAfterReleaseMs: measured, halfwayOutExit: DEFAULT_THRESHOLDS.halfwayOutExit, armHoldMs: DEFAULT_THRESHOLDS.armHoldMs }));
  });

  it("changes back to the left as soon as the right hand is down and the left hand is out", () => {
    for (const cx of [0.28, 0.5, 0.72]) {
      let state = start(cx);
      const events: MovementDraft[] = [];
      for (let index = 0; index < 34; index += 1) {
        const rightUp = index >= 2 && index <= 10;
        const rightDown = index > 10 && index <= 16;
        const leftUp = index >= 17;
        const update = pushPose(
          state,
          body({
            time: index * FRAME_MS,
            cx,
            rightRaise: rightUp ? 1 : 0,
            rightHip: rightDown,
            leftRaise: leftUp ? Math.min(1, (index - 17) / 4) : 0,
          }),
        );
        state = update.state;
        events.push(...update.events);
      }
      expect(events.map((event) => event.movementType)).toEqual(["lean_right", "lean_left"]);
    }
  });

  it("emits one squat from a front-camera pose whose depth never closes the knee", () => {
    const depths: Array<{ kneeForwardM: number; kneeZSign?: -1 | 1 } | null> = [
      null,
      { kneeForwardM: 0.05 },
      { kneeForwardM: 0.05, kneeZSign: 1 },
    ];
    const timings: Record<string, unknown>[] = [];
    for (const cx of [0.28, 0.5, 0.72]) {
      for (const depth of depths) {
        let state = startLive(cx, depth);
        const events: MovementDraft[] = [];
        let bottomKnee = 180;
        const frames: PoseFrame[] = [];
        for (let index = 0; index < 8; index += 1) {
          frames.push(liveFrame({ time: index * FRAME_MS, cx, drop: (index / 7) * 0.1 }, depth));
        }
        for (let index = 0; index < 12; index += 1) {
          frames.push(liveFrame({ time: (8 + index) * FRAME_MS, cx, drop: 0.1 }, depth));
        }
        for (let index = 0; index < 8; index += 1) {
          frames.push(liveFrame({ time: (20 + index) * FRAME_MS, cx, drop: 0.1 * (1 - index / 7) }, depth));
        }
        for (const frame of frames) {
          const update = pushPose(state, frame);
          state = update.state;
          events.push(...update.events);
          if (frame.timestampMs === 14 * FRAME_MS && update.signals) bottomKnee = update.signals.kneeAngle;
        }
        const squats = events.filter((event) => event.movementType === "squat");
        expect(events.filter((event) => event.movementType === "jump")).toHaveLength(0);
        expect(squats).toHaveLength(1);
        expect(bottomKnee).toBeLessThan(state.thresholds.squatKneeEnter);
        timings.push({
          cx,
          depth: depth === null ? "world-missing" : depth.kneeZSign === 1 ? "z-flipped-0.05m" : "world-0.05m",
          squatAtMs: squats[0]?.clientTimestamp,
          bottomKnee: Number(bottomKnee.toFixed(1)),
        });
      }
    }
    console.log(JSON.stringify({ liveSquat: timings, squatHoldMs: DEFAULT_THRESHOLDS.squatHoldMs }));
  });

  it("emits two small hops when the knees are still bent on the fast frame", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    const timings: Record<string, unknown>[] = [];
    for (const cx of [0.28, 0.5, 0.72]) {
      let state = startLive(cx, null);
      const events: MovementDraft[] = [];
      let peakRise = 0;
      let bentOnJump = true;
      const hop = (index: number) => {
        const at = index % 18;
        const dipping = at >= 2 && at <= 7;
        const slowRise = at === 8;
        const fast = at === 9 || at === 10;
        const progress = dipping ? (at - 2) / 5 : 0;
        return liveFrame(
          {
            time: index * FRAME_MS,
            cx,
            hipExtra: dipping ? 0.03 * progress : slowRise ? 0.026 : fast ? 0.01 : 0,
            kneeLift: dipping ? 0.035 * progress : slowRise || fast ? 0.03 : 0,
          },
          null,
        );
      };
      for (let index = 0; index < 36; index += 1) {
        const update = pushPose(state, hop(index));
        state = update.state;
        peakRise = Math.max(peakRise, update.signals?.hipVelocity ?? 0, update.signals?.riseSpeed ?? 0);
        if (update.events.some((event) => event.movementType === "jump") && update.signals) {
          bentOnJump = bentOnJump && update.signals.kneeAngle < state.thresholds.squatKneeEnter;
        }
        events.push(...update.events);
      }
      const jumps = events.filter((event) => event.movementType === "jump");
      expect(jumps).toHaveLength(2);
      expect(jumps[0]?.eventId).not.toBe(jumps[1]?.eventId);
      expect(events.filter((event) => event.movementType === "squat")).toHaveLength(0);
      expect(peakRise).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.jumpRise);
      expect(bentOnJump).toBe(true);
      timings.push({ cx, peakRise: Number(peakRise.toFixed(2)), first: jumps[0]?.clientTimestamp, second: jumps[1]?.clientTimestamp });
    }
    console.log(JSON.stringify({ liveHop: timings, jumpRise: DEFAULT_THRESHOLDS.jumpRise }));
  });

  it("does not duck a forward bend on the same landmark stream", () => {
    for (const cx of [0.28, 0.5, 0.72]) {
      let state = startLive(cx, null);
      const events: MovementDraft[] = [];
      for (let index = 0; index < 12; index += 1) {
        const update = pushPose(state, liveFrame({ time: index * FRAME_MS, cx, shoulderDrop: index >= 2 ? 0.14 : 0 }, null));
        state = update.state;
        events.push(...update.events);
      }
      expect(events.filter((event) => event.movementType === "squat" || event.movementType === "jump")).toHaveLength(0);
      expect(state.lastReject?.reason).toBe("forward_bend");
    }
  });

  it("does not emit a squat or a jump for running in place", () => {
    for (const cx of [0.28, 0.5, 0.72]) {
      let state = startLive(cx, null);
      const events: MovementDraft[] = [];
      for (let index = 0; index < 30; index += 1) {
        const marching = index % 6 < 3;
        const update = pushPose(
          state,
          liveFrame({ time: index * FRAME_MS, cx, hipExtra: marching ? 0.008 : 0, kneeLift: marching ? 0.04 : 0 }, null),
        );
        state = update.state;
        events.push(...update.events);
      }
      expect(events.filter((event) => event.movementType === "squat" || event.movementType === "jump")).toHaveLength(0);
    }
  });

  it("does not repeat a held raise and does not fire when both arms are out", () => {
    const held = run(
      start(0.5),
      Array.from({ length: 18 }, (_, index) => body({ time: index * FRAME_MS, rightRaise: index >= 2 ? 1 : 0 })),
    );
    expect(held.events.filter((event) => event.movementType === "lean_right")).toHaveLength(1);

    const both = run(
      start(0.5),
      Array.from({ length: 12 }, (_, index) => body({ time: index * FRAME_MS, rightRaise: index >= 2 ? 1 : 0, leftRaise: index >= 2 ? 1 : 0 })),
    );
    expect(both.events).toHaveLength(0);
    expect(both.state.lastReject?.reason).toBe("both_arms");
  });
});
