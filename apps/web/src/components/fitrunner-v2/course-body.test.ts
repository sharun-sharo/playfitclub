import { describe, expect, it } from "vitest";
import { groundCourseBody, releaseStuckClip, replayClip, verticalCommandReady } from "./course-body";

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
});
