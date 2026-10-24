import { describe, expect, it } from "vitest";
import { groundCourseBody, verticalCommandReady } from "./course-body";

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
  });
});
