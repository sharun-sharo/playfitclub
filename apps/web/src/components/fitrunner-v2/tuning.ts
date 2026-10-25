import { HIT_INVULNERABILITY_MS } from "@fitplay/shared";

export type GraphicsQuality = "low" | "medium" | "high";
export type LaneEasing = "smoothstep" | "cubic";

/** Adjustable FitRunner V2 prototype parameters. Gameplay reads this object live. */
export const fitRunnerTuning = {
  tileSize: 3,
  laneSpacing: 3,
  /**
   * Seconds to travel one lane. Collision uses this position. The box size does not change.
   * 0.10s and an ease-out start on the command frame. 0.25s smoothstep stayed put at the start.
   */
  laneChangeDuration: 0.1,
  laneEasing: "smoothstep" as LaneEasing,
  /** Peak parent bank while sliding, in radians. Upright again when the slide stops. */
  leanRadians: 0.2,
  leanDamp: 12,
  /** Extra delay before another lane key is accepted. Zero responds on the keydown frame. */
  laneInputCooldown: 0,
  showColliders: false,
  /** Mixamo run covers 3.32 m in 0.70 s. Playback and world speed stay near that stride. */
  runTimeScale: 1.25,
  crossfade: 0.1,
  forwardSpeed: 6.15,
  speedGain: 0.045,
  maxSpeed: 8.2,
  hitSlowMultiplier: 0.55,
  hitRecovery: 0.55,
  /** Local post-hit window. Matches the server's HIT_INVULNERABILITY_MS. */
  invulnerable: HIT_INVULNERABILITY_MS / 1000,
  laneStick: 0.45,
  coinDepth: 0.75,
  segmentCount: 22,
  recycleBehind: 10,
  /**
   * Old tile step. The live course no longer spawns from this. Obstacle times
   * come from the shared schedule, which is wider than 9 m so a person can act.
   */
  obstacleEvery: 3,
  obstacleLeadIn: 4,
  coinEvery: 2,
  distancePoints: 1,
  coinPoints: 25,
  /** Mixamo faces +Z after export. PI turns the runner down the -Z track. */
  modelYaw: Math.PI,
  camera: {
    fov: 47,
    distance: 4.35,
    height: 1.68,
    lookAhead: 6.4,
    lookHeight: 0.98,
    smooth: 7,
    fovGain: 4,
    landingDip: 0.08,
    jumpLook: 0.1,
  },
  quality: "high" as GraphicsQuality,
  props: {
    treeHeight: 5.6,
    bushHeight: 1.5,
    stallHeight: 2.35,
    marketHeight: 1.35,
    basketHeight: 0.55,
    sceneryFence: { x: 0.28, y: 1.05, z: 2.4 },
    sceneryRockHeight: 1.15,
    rockHeight: 0.46,
    /** Top of the lime hurdle bar. The hit mesh is that bar, not the air under it. */
    log: { x: 2.05, y: 0.4, z: 0.16 },
    /** Tall bar. Lifted by fenceGap so a roll fits underneath and a jump does not clear the top. */
    fence: { x: 2.05, y: 1.62, z: 0.18 },
    /** Lane cargo crate. Outer size is the hit volume: one lane wide, taller than a jump. */
    blocker: { x: 2.2, y: 2.78, z: 1.18 },
  },
  /** Bottom of the lane fence, in meters. The roll stays under this; a jump does not clear the top. */
  fenceGap: 1.28,
  sceneryX: {
    tree: 8.4,
    shop: 9.1,
    fence: 5.2,
    rock: 6.4,
  },
};
