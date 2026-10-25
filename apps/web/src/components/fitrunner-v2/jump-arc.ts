import { fitRunnerTuning as tuning } from "./tuning";

/**
 * Local jump arc for FitRunner V2. Overlap is decided here on the TV or laptop.
 * The server does not simulate this trajectory. It owns lives, accepted obstacle
 * ids, duplicate rejection, and accepted movement commands.
 *
 * The previous arc was not a takeoff velocity. JumpUp's hip curve rose for 0.267 s
 * to a 0.574 m parent lift, then fallGravity of 28 m/s² brought the skinned feet
 * down. Collision feet (every 8th skinned vertex) stayed off the ground for 0.45 s
 * and peaked at 0.651 m. Travel was 0.45 × speed: 2.768 m at 6.15 m/s and 3.690 m
 * at 8.2 m/s. The feet were above a 0.40 m hurdle for only ~0.25 s of that hang,
 * so the body landed on the trailing edge.
 *
 * This arc is ballistic: height = v t − ½ g t².
 *   v = 5.6 m/s, g = 18 m/s²
 *   airborne = 2v/g = 0.622 s (38% longer than 0.45 s)
 *   peak = v²/(2g) = 0.871 m (0.22 m above the old foot peak)
 *   travel at 6.15 m/s = 3.827 m; at 8.2 m/s = 5.102 m
 * g = 18 m/s² is about 1.8 g. The apex slows for a short natural hang, then the
 * body is still moving downward at landing. It does not float, and it is not the
 * old 28 m/s² slam.
 *
 * Effective clearance is airborne duration × course speed, compared with
 * obstacle collision depth + player collision depth + margin.
 * Player depth is the airborne body, not a shrunk hit box: the JumpUp pose's
 * skinned AABB is about 0.65 m deep (front 0.48 m, back 0.22 m). 0.70 m covers
 * the vertices the every-8th sample can miss. The margin (0.45 m) is the landing
 * stride, whose back foot reaches ~0.69 m behind the origin.
 *
 *   hurdle 0.16 + 0.70 + 0.45 = 1.31 m. Both speeds clear it (3.83 m and 5.10 m).
 *   plyo box 0.61 + 0.70 + 0.45 = 1.76 m. Both speeds clear it.
 * A jump started close still has to be high before the leading face, which is
 * the tighter check at max speed. A jump started early still has to be high at
 * the trailing edge, which is the tighter check at low speed. The sweep test
 * covers both. Max travel is 5.10 m. The live schedule keeps obstacles
 * farther apart than the old 9 m tile step, and the track is not sped up.
 */
export const PREVIOUS_JUMP = {
  fallGravity: 28,
  airborneSeconds: 0.45,
  peakHeightMeters: 0.651,
  hipLiftMeters: 0.574,
  riseSeconds: 0.267,
} as const;

export const JUMP_VELOCITY = 5.6;
export const JUMP_GRAVITY = 18;
export const AIRBORNE_SECONDS = (2 * JUMP_VELOCITY) / JUMP_GRAVITY;
export const PEAK_HEIGHT_M = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * JUMP_GRAVITY);

/** Airborne skinned body: 0.48 m ahead of the origin and 0.22 m behind it. */
export const PLAYER_FRONT_M = 0.48;
export const PLAYER_BACK_M = 0.22;
export const PLAYER_COLLISION_DEPTH_M = PLAYER_FRONT_M + PLAYER_BACK_M;
export const CLEARANCE_MARGIN_M = 0.45;

export const OBSTACLE_SPACING_M = tuning.tileSize * tuning.obstacleEvery;

/** Lime agility hurdle. The hit volume is the bar, top at props.log.y, depth props.log.z. */
export const AGILITY_HURDLE = {
  name: "agility hurdle",
  top: tuning.props.log.y,
  depth: tuning.props.log.z,
} as const;

/**
 * Standard 24 in plyometric box (0.61 m square). The course does not spawn this
 * mesh. Hurdles are jumped. Overhead gates are rolled. The cargo crate is the
 * lane blocker and is not a jump box.
 */
export const PLYO_BOX = {
  name: "plyometric box",
  top: 0.61,
  depth: 0.61,
} as const;

export type ClearanceObstacle = {
  name: string;
  top: number;
  depth: number;
};

/** Lead is the gap from the front of the body to the obstacle's leading face at takeoff. */
export const CLEARANCE_CASES = [
  { obstacle: AGILITY_HURDLE, speed: "low" as const, when: "close" as const, lead: 0.9 },
  { obstacle: AGILITY_HURDLE, speed: "low" as const, when: "early" as const, lead: 1.6 },
  { obstacle: AGILITY_HURDLE, speed: "max" as const, when: "close" as const, lead: 0.9 },
  { obstacle: AGILITY_HURDLE, speed: "max" as const, when: "early" as const, lead: 1.6 },
  { obstacle: PLYO_BOX, speed: "low" as const, when: "close" as const, lead: 1.3 },
  { obstacle: PLYO_BOX, speed: "low" as const, when: "early" as const, lead: 1.45 },
  { obstacle: PLYO_BOX, speed: "max" as const, when: "close" as const, lead: 1.3 },
  { obstacle: PLYO_BOX, speed: "max" as const, when: "early" as const, lead: 1.45 },
] as const;

export function courseSpeed(name: "low" | "max") {
  return name === "low" ? tuning.forwardSpeed : tuning.maxSpeed;
}

export function travelMeters(speed: number) {
  return AIRBORNE_SECONDS * speed;
}

export function requiredTravel(obstacle: ClearanceObstacle) {
  return obstacle.depth + PLAYER_COLLISION_DEPTH_M + CLEARANCE_MARGIN_M;
}

export type JumpSample = {
  elapsed: number;
  height: number;
  verticalSpeed: number;
  airborne: boolean;
  phase: "rise" | "fall" | "ground";
};

export function sampleJump(elapsed: number): JumpSample {
  const t = Math.max(0, elapsed);
  if (t >= AIRBORNE_SECONDS) {
    return {
      elapsed: t,
      height: 0,
      verticalSpeed: -JUMP_VELOCITY,
      airborne: false,
      phase: "ground",
    };
  }
  const height = Math.max(0, JUMP_VELOCITY * t - 0.5 * JUMP_GRAVITY * t * t);
  const verticalSpeed = JUMP_VELOCITY - JUMP_GRAVITY * t;
  return {
    elapsed: t,
    height,
    verticalSpeed,
    airborne: true,
    phase: verticalSpeed >= 0 ? "rise" : "fall",
  };
}

export type JumpArc = { elapsed: number; active: boolean };

/** One accepted command starts one arc. A second command while that arc is active does not start another. */
export function beginJumpArc(arc: JumpArc | null): JumpArc | null {
  if (arc?.active) return null;
  return { elapsed: 0, active: true };
}

export function stepJumpArc(arc: JumpArc, dt: number): JumpArc {
  if (!arc.active) return arc;
  const elapsed = arc.elapsed + Math.max(0, dt);
  if (!sampleJump(elapsed).airborne) return { elapsed: AIRBORNE_SECONDS, active: false };
  return { elapsed, active: true };
}

/**
 * Scrub JumpUp across the rise while the arc rises, then back toward the takeoff
 * pose while it falls, so the legs are extended again as the feet reach the ground.
 * The clip stays between takeoff and apex. The pre-takeoff crouch and the loop snap
 * are not played. Once the arc is grounded the caller leaves JumpUp.
 */
export function jumpClipTime(elapsed: number, takeoffTime: number, apexTime: number) {
  const sample = sampleJump(elapsed);
  if (!sample.airborne) return { time: takeoffTime, grounded: true };
  const span = Math.max(0, apexTime - takeoffTime);
  const rise = AIRBORNE_SECONDS / 2;
  const along = sample.phase === "rise" ? sample.elapsed / rise : 1 - (sample.elapsed - rise) / rise;
  const clamped = Math.min(1, Math.max(0, along));
  return { time: takeoffTime + span * clamped, grounded: false };
}

/** Clip a jump command plays. Loaded from /assets/fitrunner/running-jump.glb. */
export const RUNNING_JUMP_CLIP = "RunningJump";

/**
 * Feet in game/Running Jump.fbx, before root translation was removed.
 * The plant foot clears 3 cm at 0.036 s. The lead foot is back within 3 cm at 0.598 s.
 * That 0.562 s span is played forward across the 0.622 s ballistic window.
 */
export const RUNNING_JUMP_LEAVE_S = 0.036;
export const RUNNING_JUMP_RETURN_S = 0.598;

export function jumpCommandClip(): typeof RUNNING_JUMP_CLIP {
  return RUNNING_JUMP_CLIP;
}

/**
 * Map the ballistic clock onto Running Jump so the feet leave with takeoff and
 * return with landing. The clip plays forward. It is not reversed on the way down.
 */
export function runningJumpClipTime(
  elapsed: number,
  leaveTime = RUNNING_JUMP_LEAVE_S,
  returnTime = RUNNING_JUMP_RETURN_S,
) {
  const sample = sampleJump(elapsed);
  if (!sample.airborne) return { time: returnTime, grounded: true };
  const span = Math.max(0, returnTime - leaveTime);
  const along = Math.min(1, Math.max(0, sample.elapsed / AIRBORNE_SECONDS));
  return { time: leaveTime + span * along, grounded: false };
}

export function bodyHitsObstacle(input: {
  footHeight: number;
  bodyMinZ: number;
  bodyMaxZ: number;
  obstacleMinZ: number;
  obstacleMaxZ: number;
  obstacleTop: number;
}) {
  const overlapsZ = input.bodyMaxZ > input.obstacleMinZ && input.bodyMinZ < input.obstacleMaxZ;
  if (!overlapsZ) return false;
  return input.footHeight < input.obstacleTop;
}

export type ClearanceSweep = {
  hits: number;
  /** Meters the trailing edge sits behind the player's back at the grounded sample. Positive means it is behind. */
  landedGap: number;
  travel: number;
  required: number;
};

/**
 * Forward is −Z. The obstacle's leading face is z = 0 and its trailing face is z = −depth.
 * The body keeps the airborne collision depth for the whole arc. A grounded sample that
 * still overlaps the hit volume counts as a collision.
 */
export function sweepClearance(input: { obstacle: ClearanceObstacle; speed: number; lead: number; dt?: number }): ClearanceSweep {
  const dt = input.dt ?? 1 / 200;
  const depth = input.obstacle.depth;
  let originZ = input.lead + PLAYER_FRONT_M;
  let t = 0;
  let hits = 0;
  while (t < AIRBORNE_SECONDS) {
    const step = Math.min(dt, AIRBORNE_SECONDS - t);
    t += step;
    originZ -= input.speed * step;
    const sample = sampleJump(t);
    const hit = bodyHitsObstacle({
      footHeight: sample.height,
      bodyMinZ: originZ - PLAYER_FRONT_M,
      bodyMaxZ: originZ + PLAYER_BACK_M,
      obstacleMinZ: -depth,
      obstacleMaxZ: 0,
      obstacleTop: input.obstacle.top,
    });
    if (hit) hits += 1;
    if (!sample.airborne) break;
  }
  const playerBackZ = originZ + PLAYER_BACK_M;
  return {
    hits,
    landedGap: -depth - playerBackZ,
    travel: travelMeters(input.speed),
    required: requiredTravel(input.obstacle),
  };
}
