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
 * X Bot and the pulse robot ship Run, JumpUp, ForwardRoll, LongJump, StandUp, and WipeSweat.
 * None of those is a strafe or a side-step, so the lane change plays this pose on top of Run.
 * Seconds. The mesh is in the accepted lane at the end. Collision uses that lane from the command.
 */
export const SIDE_STEP_S = 0.3;

/** Ease-out travel. 0 at the command, 1 when the mesh has arrived. */
export function sideStepTravel(t: number): number {
  return laneSlideFraction(t);
}

export interface SideStepPose {
  travel: number;
  /** Radians. Positive leans toward +X, which is lane right. */
  torso: number;
  /** World-Z radians added to each hip and foot. Positive swings that foot toward +X. */
  leftHip: number;
  rightHip: number;
  leftFoot: number;
  rightFoot: number;
}

function stepWindow(t: number) {
  return Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
}

function stepBump(t: number, center: number, width: number) {
  const x = (t - center) / width;
  return Math.exp(-x * x);
}

/**
 * Athletic side-step on the run clip. t is 0 at the command and 1 at SIDE_STEP_S.
 * The pose is back in the run at both ends. direction -1 steps toward lane left.
 */
export function sideStepPose(t: number, direction: -1 | 1): SideStepPose {
  const clamped = Math.min(1, Math.max(0, t));
  const window = stepWindow(clamped);
  const push = window * stepBump(clamped, 0.22, 0.2);
  const reach = window * stepBump(clamped, 0.62, 0.22);
  const dir = direction;
  return {
    travel: sideStepTravel(clamped),
    torso: dir * 0.26 * window * stepBump(clamped, 0.36, 0.28),
    leftHip: dir > 0 ? -0.55 * push : -0.42 * reach,
    rightHip: dir > 0 ? 0.42 * reach : 0.55 * push,
    leftFoot: dir > 0 ? -0.35 * push : 0.22 * reach,
    rightFoot: dir > 0 ? 0.22 * reach : 0.35 * push,
  };
}

/**
 * Moves the hit volume onto the accepted lane while the mesh is still stepping.
 * The same amount is added to both sides, so the box is not shrunk.
 * Zero once the mesh has arrived.
 */
export function laneHitShift(acceptedLane: number, visualLane: number, spacing: number) {
  return (acceptedLane - visualLane) * spacing;
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
