import { SIDE_ROAD_CLEARANCE, roadOuterEdge } from "./side-scenery";

/**
 * Plants and trees baked from the local trees folder.
 * Scenery only. These ids are not obstacle kinds, so a plant cannot spend a life.
 * The dense fern stays on the high-quality tier. The others show at every quality.
 */
export const ROADSIDE_PLANTS = [
  { id: "cherry-a", url: "/assets/fitrunner/trees/cherry-a.glb", tier: 0 },
  { id: "cherry-b", url: "/assets/fitrunner/trees/cherry-b.glb", tier: 0 },
  { id: "cherry-c", url: "/assets/fitrunner/trees/cherry-c.glb", tier: 0 },
  { id: "palm-tree", url: "/assets/fitrunner/trees/palm-tree.glb", tier: 0 },
  { id: "palm-a", url: "/assets/fitrunner/trees/palm-a.glb", tier: 0 },
  { id: "palm-b", url: "/assets/fitrunner/trees/palm-b.glb", tier: 0 },
  { id: "palm-c", url: "/assets/fitrunner/trees/palm-c.glb", tier: 0 },
  { id: "banana-a", url: "/assets/fitrunner/trees/banana-a.glb", tier: 0 },
  { id: "banana-b", url: "/assets/fitrunner/trees/banana-b.glb", tier: 0 },
  { id: "fern-b", url: "/assets/fitrunner/trees/fern-b.glb", tier: 0 },
  { id: "fern-c", url: "/assets/fitrunner/trees/fern-c.glb", tier: 0 },
  { id: "fern-d", url: "/assets/fitrunner/trees/fern-d.glb", tier: 0 },
  { id: "fern-e", url: "/assets/fitrunner/trees/fern-e.glb", tier: 0 },
  { id: "fern-f", url: "/assets/fitrunner/trees/fern-f.glb", tier: 0 },
  { id: "monstera-a", url: "/assets/fitrunner/trees/monstera-a.glb", tier: 0 },
  { id: "monstera-b", url: "/assets/fitrunner/trees/monstera-b.glb", tier: 0 },
  { id: "monstera-c", url: "/assets/fitrunner/trees/monstera-c.glb", tier: 0 },
  { id: "monstera-d", url: "/assets/fitrunner/trees/monstera-d.glb", tier: 0 },
  { id: "fern-a", url: "/assets/fitrunner/trees/fern-a.glb", tier: 2 },
] as const;

/** Extra meters so sway and a rotated canopy stay past the road edge. */
export const ROADSIDE_PLANT_PAD = 0.35;

/**
 * Center of a plant on one side of the road.
 * halfReach is the farthest horizontal corner, so any yaw stays
 * at least 2.5 m past the road's outer edge.
 */
export function roadsidePlantX(side: -1 | 1, halfReach: number, scale: number, edge = roadOuterEdge()) {
  const reach = Math.max(0, halfReach) * Math.max(scale, 0);
  return side * (edge + SIDE_ROAD_CLEARANCE + reach + ROADSIDE_PLANT_PAD);
}

export function roadsidePlantClearance(halfReach: number, scale: number, edge = roadOuterEdge()) {
  const center = Math.abs(roadsidePlantX(1, halfReach, scale, edge));
  return center - Math.max(0, halfReach) * Math.max(scale, 0) - edge;
}

/** Cycles the whole set along the run so neighboring plants are different models. */
export function roadsideVariant(spawn: number, ordinal: number, count: number = ROADSIDE_PLANTS.length) {
  if (count <= 0) return 0;
  const mixed = spawn * 4 + ordinal;
  return ((mixed % count) + count) % count;
}
