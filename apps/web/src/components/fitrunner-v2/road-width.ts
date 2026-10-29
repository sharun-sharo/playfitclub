import { fitRunnerTuning as tuning } from "./tuning";

/**
 * Squat-gate foot, in meters from the obstacle origin.
 * The left lane sits at -laneSpacing. This foot is the widest obstacle part.
 */
export const GATE_FOOT_CENTER_M = 1.04;
export const GATE_FOOT_WIDTH_M = 0.32;

/** Asphalt kept past that foot. The same margin is used on both sides. */
export const ROAD_MARGIN_M = 0.25;

/** Raised lip. Same width on both edges, sitting just outside the asphalt. */
export const VERGE_WIDTH_M = 1.15;

/** Lip still showing once the grass or sand plane begins. */
export const LIP_SHOW_M = 0.34;

export type RoadLayout = {
  /** Lane centers stay at ±laneSpacing. Widening the asphalt does not move them. */
  laneSpacing: number;
  /** Outermost face of a gate foot, meters from the road center. */
  obstacleReach: number;
  /** Gray road edge. Grass, sand, and both lips start outside it. */
  roadEdge: number;
  /** Where the grass and sand planes begin. */
  groundEdge: number;
  vergeWidth: number;
  /** Inner edge of the lip. It matches the road edge, so the lip does not cover the foot. */
  lipInner: number;
  laneAsphaltOuter: number;
  shoulderInner: number;
  shoulderOuter: number;
  shoulderWidth: number;
};

/** Distances from the road center. Callers mirror them on the left and the right. */
export function roadLayout(laneSpacing = tuning.laneSpacing): RoadLayout {
  const obstacleReach = laneSpacing + GATE_FOOT_CENTER_M + GATE_FOOT_WIDTH_M / 2;
  const roadEdge = obstacleReach + ROAD_MARGIN_M;
  const laneAsphaltOuter = laneSpacing + 0.75 * 1.02;
  const shoulderInner = laneAsphaltOuter - 0.05;
  const shoulderOuter = roadEdge + 0.03;
  return {
    laneSpacing,
    obstacleReach,
    roadEdge,
    groundEdge: roadEdge + LIP_SHOW_M,
    vergeWidth: VERGE_WIDTH_M,
    lipInner: roadEdge,
    laneAsphaltOuter,
    shoulderInner,
    shoulderOuter,
    shoulderWidth: shoulderOuter - shoulderInner,
  };
}
