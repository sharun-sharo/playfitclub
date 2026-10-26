import { describe, expect, it } from "vitest";
import {
  COMMAND_STALE_MS,
  createDetector,
  DEFAULT_THRESHOLDS,
  neutralFromLandmarks,
  pushPose,
  setNeutral,
  type Landmark,
  type PoseFrame,
} from "@fitplay/game";
import {
  cameraBoxKeepsFrames,
  cameraSampleSource,
  classificationTimestamp,
  paintedCameraSampleSource,
  emptyCameraGate,
  emptyVideoCursor,
  finishCameraFrame,
  framePresentationMs,
  offerCameraFrame,
  takeAnimationSample,
  takeVideoFrame,
  videoFrameKeepsClock,
  VIDEO_FRAME_FALLBACK_MS,
  type VideoFrameCursor,
} from "./frame-gate";

function landmark(x: number, y: number, visibility = 1): Landmark {
  return { x, y, visibility };
}

function pose(options: {
  time: number;
  hipDrop?: number;
  rise?: number;
  shoulderLean?: number;
  kneeForward?: number;
}): PoseFrame {
  const cx = 0.5;
  const rise = options.rise ?? 0;
  const hipDrop = options.hipDrop ?? 0;
  const shoulderY = 0.3 - rise;
  const hipY = 0.5 + hipDrop - rise;
  const kneeY = 0.68 + hipDrop * 0.45 - rise;
  const ankleY = 0.88 - rise * 0.6;
  const kneeForward = options.kneeForward ?? (hipDrop > 0.05 ? 0.09 : 0.01);
  const points: Landmark[] = Array.from({ length: 33 }, () => landmark(cx, 0.5, 0.1));
  const set = (index: number, x: number, y: number) => {
    points[index] = landmark(x, y, 1);
  };
  set(0, cx, shoulderY - 0.08);
  set(11, cx - 0.08, shoulderY);
  set(12, cx + 0.08, shoulderY);
  set(13, cx - 0.1, shoulderY + 0.08);
  set(15, cx - 0.08, shoulderY + 0.16);
  set(14, cx + 0.1, shoulderY + 0.08);
  set(16, cx + 0.08, shoulderY + 0.16);
  set(23, cx - 0.06, hipY);
  set(24, cx + 0.06, hipY);
  set(25, cx - 0.07 + kneeForward, kneeY);
  set(26, cx + 0.07 - kneeForward, kneeY);
  set(27, cx - 0.05, ankleY);
  set(28, cx + 0.05, ankleY);
  if (options.shoulderLean) {
    for (const index of [11, 12]) {
      const point = points[index];
      if (point) points[index] = { ...point, x: point.x + options.shoulderLean };
    }
  }
  return { timestampMs: options.time, landmarks: points };
}

/** Phone requestVideoFrameCallback payload. mediaTime is seconds. The other stamps are milliseconds. */
function phoneMetadata(index: number, presentedFrames: number) {
  const arrivedAt = 180_000 + index * 33;
  return {
    arrivedAt,
    callbackNow: arrivedAt,
    metadata: {
      mediaTime: 3.2 + index * 0.033,
      presentationTime: arrivedAt,
      presentedFrames,
    },
  };
}

function classifyPhoneFrames(count: number, presentedFrames: number | "increment") {
  let cursor: VideoFrameCursor = emptyVideoCursor();
  let gate = emptyCameraGate();
  let last = 0;
  const stamps: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const frame = phoneMetadata(index, presentedFrames === "increment" ? index + 1 : presentedFrames);
    const taken = takeVideoFrame(cursor, frame);
    cursor = taken.cursor;
    expect(taken.accept).toBe(true);
    const offer = offerCameraFrame(gate, taken.frameAt, frame.arrivedAt, COMMAND_STALE_MS);
    expect(offer.action).toBe("run");
    if (offer.action !== "run") return stamps;
    const done = finishCameraFrame(offer.gate, frame.arrivedAt, COMMAND_STALE_MS);
    expect(done.action).toBe("ignore");
    gate = done.gate;
    const stamp = classificationTimestamp(offer.at, frame.arrivedAt, last, COMMAND_STALE_MS);
    last = stamp;
    stamps.push(stamp);
  }
  return stamps;
}

function play(times: number[], build: (index: number, time: number) => PoseFrame, smoothingAlpha = 1) {
  const neutral = neutralFromLandmarks(pose({ time: 0 }).landmarks);
  if (!neutral) throw new Error("Failed to build a neutral pose");
  let state = setNeutral(createDetector({ mirror: false, smoothingAlpha, cooldownMs: 200 }), neutral);
  const events = [];
  for (let index = 0; index < times.length; index += 1) {
    const update = pushPose(state, build(index, times[index] ?? 0));
    state = update.state;
    events.push(...update.events);
  }
  return events;
}

describe("camera frame gate", () => {
  it("does not run a second pose while inference is busy, and drops the older queued frame", () => {
    const first = offerCameraFrame(emptyCameraGate(), 1_000, 1_000, 800);
    expect(first.action).toBe("run");
    if (first.action !== "run") return;
    expect(first.gate.busy).toBe(true);
    expect(first.gate.running).toBe(1_000);

    const second = offerCameraFrame(first.gate, 1_033, 1_040, 800);
    expect(second.action).toBe("queue");
    if (second.action !== "queue") return;
    expect(second.gate.busy).toBe(true);
    expect(second.gate.running).toBe(1_000);

    const third = offerCameraFrame(second.gate, 1_066, 1_070, 800);
    expect(third.action).toBe("queue");
    if (third.action !== "queue") return;
    expect(third.dropped).toBe(1_033);
    expect(third.gate.queued).toBe(1_066);
    expect(third.gate.running).toBe(1_000);

    const done = finishCameraFrame(third.gate, 1_080, 800);
    expect(done.action).toBe("run");
    if (done.action !== "run") return;
    expect(done.at).toBe(1_066);
    expect(done.gate.running).toBe(1_066);
    expect(done.gate.queued).toBeNull();
  });

  it("ignores a frame that arrives after a newer one, and a frame older than the stale bound", () => {
    const newer = offerCameraFrame(emptyCameraGate(), 2_000, 2_000, 800);
    expect(newer.action).toBe("run");
    if (newer.action !== "run") return;
    const stale = offerCameraFrame(newer.gate, 1_900, 2_010, 800);
    expect(stale).toEqual({ action: "ignore", reason: "older", gate: newer.gate });

    const idle = finishCameraFrame(newer.gate, 2_010, 800);
    expect(idle.action).toBe("ignore");
    if (idle.action !== "ignore") return;
    const late = offerCameraFrame(idle.gate, 1_100, 1_100 + 801, 800);
    expect(late.action).toBe("ignore");
    if (late.action !== "ignore") return;
    expect(late.reason).toBe("stale");
    expect(late.gate.busy).toBe(false);
  });

  it("classifies a fresh video-clock frame while performance.now() is seconds ahead", () => {
    const opened = 25_000;
    let gate = emptyCameraGate();
    const accepted: number[] = [];
    for (const frameAt of [0, 66, 132, 198]) {
      const decision = offerCameraFrame(gate, frameAt, opened + frameAt, 800);
      expect(decision.action).toBe("run");
      if (decision.action !== "run") return;
      accepted.push(decision.at);
      const done = finishCameraFrame(decision.gate, opened + frameAt, 800);
      expect(done.action).toBe("ignore");
      gate = done.gate;
    }
    expect(accepted).toEqual([0, 66, 132, 198]);

    const zero = offerCameraFrame(emptyCameraGate(), 0, opened, 800);
    expect(zero.action).toBe("run");
    const micros = offerCameraFrame(emptyCameraGate(), opened * 1_000, opened, 800);
    expect(micros.action).toBe("run");
  });

  it("still runs the newest queued video frame after a short inference, and drops one that waited past 800ms", () => {
    const opened = 25_000;
    const first = offerCameraFrame(emptyCameraGate(), 0, opened, 800);
    expect(first.action).toBe("run");
    if (first.action !== "run") return;
    const queued = offerCameraFrame(first.gate, 66, opened + 40, 800);
    expect(queued.action).toBe("queue");
    if (queued.action !== "queue") return;
    const fresh = finishCameraFrame(queued.gate, opened + 50, 800);
    expect(fresh.action).toBe("run");
    if (fresh.action !== "run") return;
    expect(fresh.at).toBe(66);

    const stale = finishCameraFrame(queued.gate, opened + 66 + 801, 800);
    expect(stale.action).toBe("ignore");
    if (stale.action !== "ignore") return;
    expect(stale.reason).toBe("stale");
  });

  it("keeps a millisecond video clock and does not classify on a stuck 0 or a microsecond stamp", () => {
    let last = 0;
    const video = [66, 132, 198].map((frameAt) => {
      const stamp = classificationTimestamp(frameAt, 25_000 + frameAt, last, 800);
      last = stamp;
      return stamp;
    });
    expect(video).toEqual([66, 132, 198]);

    expect(classificationTimestamp(0, 25_000, 0, 800)).toBe(25_000);
    expect(classificationTimestamp(25_000_000, 25_000, 0, 800)).toBe(25_000);

    const sameClock = classificationTimestamp(25_033, 25_040, 25_000, 800);
    expect(sameClock).toBe(25_033);
  });

  it("classifies a fresh phone frame when mediaTime is seconds, and a small jump, squat, and lean still emit", () => {
    expect(DEFAULT_THRESHOLDS.jumpRise).toBe(0.32);
    expect(DEFAULT_THRESHOLDS.squatEnterDrop).toBe(0.1);
    expect(DEFAULT_THRESHOLDS.torsoLeanEnter).toBe(0.16);
    expect(VIDEO_FRAME_FALLBACK_MS).toBe(400);

    expect(framePresentationMs(180_000, { mediaTime: 3.2, presentationTime: 180_000 }, 180_000)).toBe(180_000);
    expect(framePresentationMs(3.2, { mediaTime: 3.2, presentationTime: 180_000 }, 180_000)).toBe(180_000);
    expect(framePresentationMs(3.2, { mediaTime: 3.2, expectedDisplayTime: 180_000 }, 180_000)).toBe(180_000);
    expect(framePresentationMs(3.2, { mediaTime: 3.2 }, 180_000)).toBe(180_000);
    expect(framePresentationMs(0, { mediaTime: 0, presentationTime: 0 }, 180_000)).toBe(180_000);
    expect(framePresentationMs(180_033_000, { mediaTime: 3.233, presentationTime: 180_033 }, 180_033)).toBe(180_033);

    const locked = offerCameraFrame(emptyCameraGate(), 180_000_000, 180_000, COMMAND_STALE_MS);
    expect(locked.action).toBe("run");
    if (locked.action !== "run") return;
    const blocked = offerCameraFrame(locked.gate, 180_033, 180_033, COMMAND_STALE_MS);
    expect(blocked.action).toBe("ignore");
    if (blocked.action !== "ignore") return;
    expect(blocked.reason).toBe("stale");

    const stamps = classifyPhoneFrames(10, "increment");
    expect(stamps[1]! - stamps[0]!).toBe(33);
    expect(stamps[0]).toBe(180_000);

    const stuck = classifyPhoneFrames(8, 0);
    expect(stuck[1]! - stuck[0]!).toBe(33);

    const jump = play(stamps, (index, time) => {
      const dip = index === 3 || index === 4;
      return pose({
        time,
        hipDrop: dip || index === 5 ? 0.03 : 0,
        rise: index === 5 ? 0.002244 : 0,
      });
    }, DEFAULT_THRESHOLDS.smoothingAlpha);
    expect(jump.map((event) => event.movementType)).toEqual(["jump"]);

    const squat = play(stuck, (index, time) => pose({
      time,
      hipDrop: index < 2 ? 0 : 0.22,
      kneeForward: index < 2 ? 0.01 : 0.1,
    }));
    expect(squat.map((event) => event.movementType)).toEqual(["squat"]);

    const lean = play(stuck, (index, time) => pose({ time, shoulderLean: index >= 2 ? -0.045 : 0 }));
    expect(lean.map((event) => event.movementType)).toEqual(["lean_left"]);
  });

  it("classifies on the animation clock after a long video frame is ignored", () => {
    expect(videoFrameKeepsClock("ignore")).toBe(false);
    expect(videoFrameKeepsClock("run")).toBe(true);
    expect(videoFrameKeepsClock("queue")).toBe(true);
    expect(
      cameraSampleSource({
        hasVideoFrameCallback: true,
        videoFrames: 5,
        elapsedMs: 4_000,
        sinceVideoFrameMs: videoFrameKeepsClock("ignore") ? 16 : VIDEO_FRAME_FALLBACK_MS,
      }),
    ).toBe("animation");
    expect(takeAnimationSample({ now: 1_000, lastSampleAt: 990 })).toBe(false);
    expect(takeAnimationSample({ now: 1_012, lastSampleAt: 1_000 })).toBe(true);
    expect(takeAnimationSample({ now: Number.NaN, lastSampleAt: 1_000 })).toBe(false);
  });

  it("classifies from the animation clock when the camera box is too small to present frames", () => {
    expect(cameraBoxKeepsFrames({ width: 320, height: 180 })).toBe(true);
    expect(cameraBoxKeepsFrames({ width: 112, height: 96 })).toBe(true);
    expect(cameraBoxKeepsFrames({ width: 1, height: 1 })).toBe(false);
    expect(paintedCameraSampleSource({
      boxKeepsFrames: false,
      hasVideoFrameCallback: true,
      videoFrames: 12,
      elapsedMs: 4_000,
      sinceVideoFrameMs: 16,
    })).toBe("animation");
    expect(paintedCameraSampleSource({
      boxKeepsFrames: true,
      hasVideoFrameCallback: true,
      videoFrames: 12,
      elapsedMs: 4_000,
      sinceVideoFrameMs: 16,
    })).toBe("video-frame");
  });

  it("samples the animation clock when the phone video-frame callback does not arrive", () => {
    expect(cameraSampleSource({
      hasVideoFrameCallback: true,
      videoFrames: 0,
      elapsedMs: 0,
      sinceVideoFrameMs: Number.POSITIVE_INFINITY,
    })).toBe("video-frame");
    expect(cameraSampleSource({
      hasVideoFrameCallback: true,
      videoFrames: 0,
      elapsedMs: VIDEO_FRAME_FALLBACK_MS,
      sinceVideoFrameMs: Number.POSITIVE_INFINITY,
    })).toBe("animation");
    expect(cameraSampleSource({
      hasVideoFrameCallback: false,
      videoFrames: 0,
      elapsedMs: 0,
      sinceVideoFrameMs: Number.POSITIVE_INFINITY,
    })).toBe("animation");
    expect(cameraSampleSource({
      hasVideoFrameCallback: true,
      videoFrames: 4,
      elapsedMs: 2_000,
      sinceVideoFrameMs: 33,
    })).toBe("video-frame");
    expect(cameraSampleSource({
      hasVideoFrameCallback: true,
      videoFrames: 1,
      elapsedMs: 2_000,
      sinceVideoFrameMs: VIDEO_FRAME_FALLBACK_MS,
    })).toBe("animation");

    let cursor = emptyVideoCursor();
    const first = takeVideoFrame(cursor, {
      callbackNow: 180_000,
      metadata: { presentedFrames: 0, mediaTime: 0, presentationTime: 180_000 },
      arrivedAt: 180_000,
    });
    cursor = first.cursor;
    const second = takeVideoFrame(cursor, {
      callbackNow: 180_033,
      metadata: { presentedFrames: 0, mediaTime: 0, presentationTime: 180_033 },
      arrivedAt: 180_033,
    });
    const repeat = takeVideoFrame(second.cursor, {
      callbackNow: 180_033,
      metadata: { presentedFrames: 0, mediaTime: 0, presentationTime: 180_033 },
      arrivedAt: 180_033,
    });
    expect(first.accept).toBe(true);
    expect(second.accept).toBe(true);
    expect(second.frameAt - first.frameAt).toBe(33);
    expect(repeat.accept).toBe(false);

    const counted = takeVideoFrame(emptyVideoCursor(), {
      callbackNow: 180_000,
      metadata: { presentedFrames: 1, mediaTime: 3.2, presentationTime: 180_000 },
      arrivedAt: 180_000,
    });
    const next = takeVideoFrame(counted.cursor, {
      callbackNow: 180_033,
      metadata: { presentedFrames: 2, mediaTime: 3.233, presentationTime: 180_033 },
      arrivedAt: 180_033,
    });
    const sameCount = takeVideoFrame(next.cursor, {
      callbackNow: 180_066,
      metadata: { presentedFrames: 2, mediaTime: 3.266, presentationTime: 180_066 },
      arrivedAt: 180_066,
    });
    expect(next.accept).toBe(true);
    expect(sameCount.accept).toBe(false);
  });

  it("still classifies a thumbnail when presentedFrames stays 0", () => {
    expect(cameraBoxKeepsFrames({ width: 112, height: 96 })).toBe(true);
    expect(paintedCameraSampleSource({
      boxKeepsFrames: cameraBoxKeepsFrames({ width: 112, height: 96 }),
      hasVideoFrameCallback: true,
      videoFrames: 2,
      elapsedMs: 1_000,
      sinceVideoFrameMs: 16,
    })).toBe("video-frame");

    let cursor = emptyVideoCursor();
    const first = takeVideoFrame(cursor, {
      callbackNow: 0,
      metadata: { presentedFrames: 0, mediaTime: 0, presentationTime: 1.25 },
      arrivedAt: 50_000,
    });
    cursor = first.cursor;
    const second = takeVideoFrame(cursor, {
      callbackNow: 0,
      metadata: { presentedFrames: 0, mediaTime: 0, presentationTime: 1.25 },
      arrivedAt: 50_040,
    });
    expect(first.accept).toBe(true);
    expect(second.accept).toBe(true);
    expect(first.frameAt).toBe(50_000);
    expect(second.frameAt).toBe(50_040);
    const opened = offerCameraFrame(emptyCameraGate(), first.frameAt, 50_000, 800);
    expect(opened.action).toBe("run");
    if (opened.action !== "run") return;
    expect(opened.gate.clockOffset).toBe(0);
    const followed = offerCameraFrame(
      { ...opened.gate, busy: false, running: null },
      second.frameAt,
      50_040,
      800,
    );
    expect(followed.action).toBe("run");
    if (followed.action !== "run") return;
    expect(followed.gate.clockOffset).toBe(opened.gate.clockOffset);
  });
});
