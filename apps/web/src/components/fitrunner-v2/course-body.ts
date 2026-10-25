export type CourseMotion = "run" | "jump" | "fall" | "roll" | "celebrate" | "stand" | "longJump";

/**
 * Jump and squat play only while the runner is grounded and in the run clip.
 * A lane change does not wait for that.
 */
export function verticalCommandReady(motion: string): boolean {
  return motion === "run";
}

/**
 * A jump that arrives while the duck clip is still playing.
 * The roll must not hold that jump until the 400ms stale window drops it.
 */
export function jumpDuringRoll(motion: string, movementType: string): boolean {
  return motion === "roll" && movementType === "jump";
}

/**
 * Ease-out lane slide. t is 0 at the command and 1 when the body is in the lane.
 * The first slice already moves. Smoothstep held the body still at the start.
 */
export function laneSlideFraction(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) * (1 - clamped);
}

/**
 * Play Again, the start of a pause, and resume all return here.
 * An arc or a roll that was in progress is dropped, not finished into a second jump or duck.
 */
export function groundCourseBody(): { motion: "run"; jumpActive: false; buffered: false } {
  return { motion: "run", jumpActive: false, buffered: false };
}

/** The clip Play Again applies. Jump and squat are playable. Nothing is waiting from the last run. */
export function replayClip() {
  return groundCourseBody();
}

/**
 * A jump or fall whose arc is gone never returns to the run on its own.
 * Lane changes still apply in that state. A roll that has already ended is the same.
 */
export function releaseStuckClip(input: { motion: string; jumpActive: boolean; elapsed: number; motionEndsAt: number }): "ground" | "keep" {
  if (input.motion === "run") return "keep";
  if ((input.motion === "jump" || input.motion === "fall") && !input.jumpActive) return "ground";
  if (
    (input.motion === "roll" || input.motion === "celebrate" || input.motion === "stand" || input.motion === "longJump") &&
    input.elapsed >= input.motionEndsAt
  ) {
    return "ground";
  }
  return "keep";
}
