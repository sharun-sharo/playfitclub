/** Adjustable FitRunner V2 prototype parameters. Gameplay reads this object live. */
export const fitRunnerTuning = {
  tileSize: 3,
  laneSpacing: 3,
  laneChangeDuration: 0.18,
  leanRadians: 0.28,
  leanDamp: 12,
  /** Mixamo run covers 3.32 m in 0.70 s. Playback and world speed stay near that stride. */
  runTimeScale: 1.25,
  crossfade: 0.1,
  forwardSpeed: 6.15,
  speedGain: 0.045,
  maxSpeed: 8.2,
  hitSlowMultiplier: 0.55,
  hitRecovery: 0.55,
  invulnerable: 1.15,
  /** Gravity after JumpUp, which ends at the apex. */
  fallGravity: 28,
  laneStick: 0.45,
  coinDepth: 0.75,
  segmentCount: 16,
  recycleBehind: 10,
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
  },
  props: {
    treeHeight: 5.6,
    bushHeight: 1.5,
    stallHeight: 2.35,
    marketHeight: 1.35,
    basketHeight: 0.55,
    sceneryFence: { x: 0.28, y: 1.05, z: 2.4 },
    sceneryRockHeight: 1.15,
    rockHeight: 0.46,
    log: { x: 1.85, y: 0.4, z: 0.7 },
    /** Tall bar. Lifted by fenceGap so a roll fits underneath and a jump does not clear the top. */
    fence: { x: 2.05, y: 1.62, z: 0.18 },
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
