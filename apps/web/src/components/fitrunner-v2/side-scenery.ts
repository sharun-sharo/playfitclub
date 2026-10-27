import { fitRunnerTuning as tuning } from "./tuning";

/**
 * Kenney prototype and train models parked beside the coast road.
 * Railroad track pieces are not used. These ids are dressing only:
 * they are never obstacle kinds, so they cannot spend a life.
 */
export const SIDE_PROP_IDS = ["locomotive", "container", "cottage", "vehicle", "crate", "flag"] as const;

export type SidePropId = (typeof SIDE_PROP_IDS)[number];

export type SidePlacement = {
  id: SidePropId;
  x: number;
  z: number;
  yaw: number;
};

/** Fitted height in meters. Static-mesh scale only; nothing here is skinned. */
export const SIDE_FIT_HEIGHT: Record<SidePropId, number> = {
  locomotive: 2.25,
  container: 2.05,
  vehicle: 1.35,
  cottage: 2.55,
  flag: 2.1,
  crate: 0.7,
};

/**
 * Unscaled mesh halves from the GLB accessors plus node translations.
 * Horizontal halves are rounded up so the footprint stays outside the mesh.
 * Heights are rounded down so the fitted scale stays at least as large as the mesh.
 */
const NATIVE_HALF = {
  locomotive: { height: 1.65, halfX: 0.72, halfZ: 1.31 },
  container: { height: 1.35, halfX: 0.52, halfZ: 1.36 },
  vehicle: { height: 0.77, halfX: 0.72, halfZ: 0.5 },
  flag: { height: 0.95, halfX: 0.05, halfZ: 0.25 },
  crate: { height: 0.5, halfX: 0.25, halfZ: 0.25 },
} as const;

/** Extra meters around every footprint so a mesh cannot clip the road. */
export const SIDE_FOOTPRINT_PAD = 0.08;

/** Meters of open ground required between the road edge and a side prop. */
export const SIDE_ROAD_CLEARANCE = 2.5;

const PART_BOUNDS = {
  wall: { minX: -0.1, maxX: 0.1, minY: 0, maxY: 1, minZ: -0.5, maxZ: 0.5 },
  window: { minX: -0.15, maxX: 0.15, minY: 0, maxY: 1, minZ: -0.5, maxZ: 0.5 },
  doorway: { minX: -0.15, maxX: 0.15, minY: 0, maxY: 1, minZ: -0.5, maxZ: 0.5 },
  column: { minX: -0.1, maxX: 0.1, minY: 0, maxY: 1, minZ: -0.1, maxZ: 0.1 },
} as const;

export type CottagePart = keyof typeof PART_BOUNDS;

export type CottagePiece = {
  part: CottagePart;
  x: number;
  y: number;
  z: number;
  yaw: number;
  sx: number;
  sy: number;
  sz: number;
};

/** A two-storey facade, side walls, and a roof slab. Depth points inland when placed on +X. */
export const COTTAGE_PIECES = [
  { part: "doorway", x: 0, y: 0, z: -0.5, yaw: 0, sx: 1, sy: 1, sz: 1 },
  { part: "window", x: 0, y: 0, z: 0.5, yaw: 0, sx: 1, sy: 1, sz: 1 },
  { part: "window", x: 0, y: 1, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1 },
  { part: "wall", x: 0.5, y: 0, z: -1, yaw: Math.PI / 2, sx: 1, sy: 1, sz: 1 },
  { part: "wall", x: 0.5, y: 0, z: 1, yaw: Math.PI / 2, sx: 1, sy: 1, sz: 1 },
  { part: "wall", x: 1, y: 0, z: -0.5, yaw: 0, sx: 1, sy: 1, sz: 1 },
  { part: "wall", x: 1, y: 0, z: 0.5, yaw: 0, sx: 1, sy: 1, sz: 1 },
  { part: "column", x: -0.28, y: 0, z: -1.2, yaw: 0, sx: 1, sy: 2, sz: 1 },
  { part: "column", x: -0.28, y: 0, z: 1.2, yaw: 0, sx: 1, sy: 2, sz: 1 },
  { part: "wall", x: 0.38, y: 2, z: 0, yaw: 0, sx: 9, sy: 0.16, sz: 2.9 },
] as const satisfies readonly CottagePiece[];

export type SideFootprint = {
  id: SidePropId;
  spawn: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type Aabb = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };

function emptyAabb(): Aabb {
  return {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
    minZ: Number.POSITIVE_INFINITY,
    maxZ: Number.NEGATIVE_INFINITY,
  };
}

function expand(box: Aabb, x: number, y: number, z: number) {
  box.minX = Math.min(box.minX, x);
  box.maxX = Math.max(box.maxX, x);
  box.minY = Math.min(box.minY, y);
  box.maxY = Math.max(box.maxY, y);
  box.minZ = Math.min(box.minZ, z);
  box.maxZ = Math.max(box.maxZ, z);
}

function pieceAabb(piece: CottagePiece): Aabb {
  const local = PART_BOUNDS[piece.part];
  const box = emptyAabb();
  const c = Math.cos(piece.yaw);
  const s = Math.sin(piece.yaw);
  const xs = [local.minX * piece.sx, local.maxX * piece.sx];
  const ys = [local.minY * piece.sy, local.maxY * piece.sy];
  const zs = [local.minZ * piece.sz, local.maxZ * piece.sz];
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        expand(box, x * c + z * s + piece.x, y + piece.y, -x * s + z * c + piece.z);
      }
    }
  }
  return box;
}

export function cottageLocalBounds(): Aabb {
  const box = emptyAabb();
  for (const piece of COTTAGE_PIECES) {
    const part = pieceAabb(piece);
    expand(box, part.minX, part.minY, part.minZ);
    expand(box, part.maxX, part.maxY, part.maxZ);
  }
  return box;
}

function fittedLocalHalves(id: SidePropId) {
  if (id === "cottage") {
    const bounds = cottageLocalBounds();
    const height = Math.max(0.0001, bounds.maxY - bounds.minY);
    const scale = SIDE_FIT_HEIGHT.cottage / height;
    return {
      halfX: ((bounds.maxX - bounds.minX) / 2) * scale,
      halfZ: ((bounds.maxZ - bounds.minZ) / 2) * scale,
    };
  }
  const native = NATIVE_HALF[id];
  const scale = SIDE_FIT_HEIGHT[id] / native.height;
  return { halfX: native.halfX * scale, halfZ: native.halfZ * scale };
}

function worldHalves(placement: SidePlacement) {
  const local = fittedLocalHalves(placement.id);
  const c = Math.abs(Math.cos(placement.yaw));
  const s = Math.abs(Math.sin(placement.yaw));
  return {
    x: local.halfX * c + local.halfZ * s + SIDE_FOOTPRINT_PAD,
    z: local.halfX * s + local.halfZ * c + SIDE_FOOTPRINT_PAD,
  };
}

/**
 * One dressing set per coast module. Negative X is the inland grass.
 * Positive X is the beach, still short of the water.
 * Spawn index only — the obstacle seed is not read.
 */
const MODULE_PROPS: readonly (readonly SidePlacement[])[] = [
  [
    { id: "locomotive", x: -13.2, z: 0, yaw: 0 },
    { id: "crate", x: -15.5, z: 0.55, yaw: 0.4 },
  ],
  [
    { id: "cottage", x: 14.2, z: 0, yaw: 0 },
    { id: "flag", x: 16.55, z: 0.7, yaw: Math.PI / 2 },
  ],
  [
    { id: "container", x: -13.2, z: 0, yaw: Math.PI },
    { id: "crate", x: -15.5, z: -0.45, yaw: 1.1 },
  ],
  [{ id: "vehicle", x: -10.15, z: 0.15, yaw: Math.PI / 2 }],
];

export function sidePlacements(spawn: number): readonly SidePlacement[] {
  const index = ((spawn % MODULE_PROPS.length) + MODULE_PROPS.length) % MODULE_PROPS.length;
  return MODULE_PROPS[index] ?? [];
}

/** Outer edge of the three road tiles. Matches the road width already in the course. */
export function roadOuterEdge(tileSize = tuning.tileSize, laneSpacing = tuning.laneSpacing) {
  return laneSpacing + (tileSize * 1.02) / 2;
}

export function sideFootprints(spawn: number, tileSize = tuning.tileSize): SideFootprint[] {
  const segmentZ = -spawn * tileSize;
  return sidePlacements(spawn).map((placement) => {
    const half = worldHalves(placement);
    return {
      id: placement.id,
      spawn,
      minX: placement.x - half.x,
      maxX: placement.x + half.x,
      minZ: segmentZ + placement.z - half.z,
      maxZ: segmentZ + placement.z + half.z,
    };
  });
}

/** Positive distance from the road's outer edge to this box. Negative means it enters the road. */
export function clearanceFromRoad(box: SideFootprint, edge = roadOuterEdge()) {
  if (box.maxX < 0) return -box.maxX - edge;
  if (box.minX > 0) return box.minX - edge;
  return -edge;
}

export function footprintsOverlap(a: SideFootprint, b: SideFootprint) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

export const OBSTACLE_KINDS = ["rock", "log", "fence"] as const;
