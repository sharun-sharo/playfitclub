import { describe, expect, it } from "vitest";
import { emptyCameraGate, finishCameraFrame, offerCameraFrame } from "./frame-gate";

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
});
