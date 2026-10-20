import { describe, expect, it } from "vitest";
import { calibrateNeutral, neutralFromLandmarks } from "./calibration";
import { createDetector, pushPose, setNeutral } from "./movement-state-machine";
import { DEFAULT_THRESHOLDS, type Landmark, type PoseFrame } from "./movement-types";

function landmark(x: number, y: number, visibility = 1): Landmark {
  return { x, y, visibility };
}

function pose(options: {
  cx?: number;
  hipDrop?: number;
  rise?: number;
  lean?: number;
  punch?: number;
  armsOut?: boolean;
  visibility?: number;
  hide?: number[];
  time: number;
}): PoseFrame {
  const cx = (options.cx ?? 0.5) + (options.lean ?? 0);
  const rise = options.rise ?? 0;
  const hipDrop = options.hipDrop ?? 0;
  const visibility = options.visibility ?? 1;
  const shoulderY = 0.3 - rise;
  const hipY = 0.5 + hipDrop - rise;
  const kneeY = 0.68 + hipDrop * 0.45 - rise;
  const ankleY = 0.88 - rise * 0.6;
  const kneeForward = hipDrop > 0.05 ? 0.09 : 0.01;
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
  for (const index of options.hide ?? []) points[index] = null as unknown as Landmark;
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

  it("classifies left and right leans from the calibrated center", () => {
    const left = feed(6, (index) => pose({ time: index * 80, lean: index < 2 ? 0 : -0.14 }));
    expect(left.events.map((event) => event.movementType)).toContain("lean_left");
    expect(left.events.map((event) => event.movementType)).not.toContain("lean_right");

    const right = feed(6, (index) => pose({ time: index * 80, lean: index < 2 ? 0 : 0.14 }));
    expect(right.events.map((event) => event.movementType)).toContain("lean_right");
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
    const leaned = pushPose(settled.state, pose({ time: 1200, cx: 0.62, lean: -0.14 }));
    expect(leaned.events.map((event) => event.movementType)).toContain("lean_left");
  });

  it("emits a punch on extension and a hold only after the pose is maintained", () => {
    const punch = feed(6, (index) => pose({ time: index * 80, punch: index < 2 ? 0 : 0.18 }));
    expect(punch.events.map((event) => event.movementType)).toContain("punch");

    const tooShort = feed(4, (index) => pose({ time: index * 100, armsOut: true }));
    expect(tooShort.events.map((event) => event.movementType)).not.toContain("hold");

    const held = feed(10, (index) => pose({ time: index * 120, armsOut: true }));
    expect(held.events.filter((event) => event.movementType === "hold")).toHaveLength(1);
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
      { time: 50, hipDrop: 0 },
      { time: 100, hipDrop: 0.2 },
      { time: 180, hipDrop: 0.2 },
      { time: 260, hipDrop: 0.2 },
      { time: 340, hipDrop: 0 },
      { time: 420, hipDrop: 0.2 },
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

  it("waits out smoothing before a lean just past the neutral zone is emitted", () => {
    let state = createDetector({ mirror: false });
    const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
    if (!neutral) throw new Error("Failed to build a neutral pose");
    state = setNeutral(state, neutral);
    const frameMs = 33;
    const stepAt = 8 * frameMs;
    let emittedAt: number | null = null;
    for (let index = 0; index < 18; index += 1) {
      const time = index * frameMs;
      const update = pushPose(state, pose({ time, lean: time >= stepAt ? -0.09 : 0 }));
      state = update.state;
      const lean = update.events.find((event) => event.movementType === "lean_left" || event.movementType === "lean_right");
      if (lean && emittedAt === null) emittedAt = lean.clientTimestamp;
    }
    expect(emittedAt).not.toBeNull();
    const smoothingLatencyMs = (emittedAt ?? stepAt) - stepAt;
    expect(smoothingLatencyMs).toBeGreaterThan(0);
    expect(smoothingLatencyMs).toBeLessThan(DEFAULT_THRESHOLDS.cooldownMs);
    console.log(JSON.stringify({ smoothingLatencyMs, smoothingAlpha: DEFAULT_THRESHOLDS.smoothingAlpha, frameMs }));
  });

  it("does not emit a large lean when confidence stays under the action threshold", () => {
    const { events } = feed(8, (index) => pose({ time: index * 80, lean: index < 2 ? 0 : -0.16, visibility: 0.5 }));
    expect(events).toHaveLength(0);
    expect(0.5).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.minVisibility);
    expect(0.5).toBeLessThan(DEFAULT_THRESHOLDS.minActionConfidence);
  });
});
