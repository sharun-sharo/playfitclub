import { describe, expect, it } from "vitest";
import { classificationTimestamp, emptyCameraGate, finishCameraFrame, offerCameraFrame } from "./frame-gate";

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
});
