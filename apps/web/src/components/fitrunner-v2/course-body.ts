export type CourseMotion = "run" | "jump" | "fall" | "roll" | "celebrate" | "stand" | "longJump";

/**
 * Jump and squat play only while the runner is grounded and in the run clip.
 * A lane change does not wait for that.
 */
export function verticalCommandReady(motion: string): boolean {
  return motion === "run";
}

/**
 * Play Again, the start of a pause, and resume all return here.
 * An arc or a roll that was in progress is dropped, not finished into a second jump or duck.
 */
export function groundCourseBody(): { motion: "run"; jumpActive: false; buffered: false } {
  return { motion: "run", jumpActive: false, buffered: false };
}
