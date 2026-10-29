import { fitRunnerTuning as tuning } from "./tuning";

/**
 * Static city buildings parked beside the coast road.
 * Extracted from the local ccity building set. They are dressing only:
 * never obstacle kinds, so they cannot spend a life.
 * None of these meshes are skinned.
 *
 * One street row, in the kit's FBX order. Neighboring centers on the grass
 * side are 8 m apart when the meshes allow it, and otherwise only far enough
 * to leave a sidewalk. The green path is the left side and keeps that street.
 * The beach is the right side: every other lot, so about half as many
 * buildings and a wider gap. A building still repeats only after the whole
 * kit has been used. Street lamps sit in the sidewalks. One lamp mesh is the set.
 */
export const SIDE_PROP_IDS = [
  "clinic",
  "housing",
  "laundry",
  "pawn",
  "liquor",
  "paramount",
  "gunshop",
  "apartments",
  "factory",
  "projects",
  "lamp",
] as const;

export type SidePropId = (typeof SIDE_PROP_IDS)[number];

export type SidePlacement = {
  id: SidePropId;
  x: number;
  z: number;
  yaw: number;
};

/** Fitted height in meters. Uniform scale of a static mesh. */
export const SIDE_FIT_HEIGHT: Record<SidePropId, number> = {
  clinic: 5.8,
  housing: 5.4,
  laundry: 3.3,
  pawn: 4,
  liquor: 4.4,
  paramount: 6.5,
  gunshop: 5,
  apartments: 5.8,
  factory: 4.4,
  projects: 7.4,
  lamp: 4.2,
};

/**
 * Unscaled mesh halves from the baked GLB, in meters.
 * Horizontal halves are rounded up so the footprint stays outside the mesh.
 * Heights are rounded down so the fitted scale stays at least as large as the mesh.
 */
const NATIVE_HALF = {
  clinic: { height: 19.509, halfX: 18.791, halfZ: 9.285 },
  housing: { height: 17.488, halfX: 9.262, halfZ: 9.298 },
  laundry: { height: 9.086, halfX: 9, halfZ: 9 },
  pawn: { height: 15.383, halfX: 8.787, halfZ: 9.183 },
  liquor: { height: 15.901, halfX: 10.388, halfZ: 9.45 },
  paramount: { height: 20.592, halfX: 10.678, halfZ: 9.27 },
  gunshop: { height: 17.488, halfX: 18.104, halfZ: 10.094 },
  apartments: { height: 13.921, halfX: 10.301, halfZ: 9.219 },
  factory: { height: 17.762, halfX: 26.737, halfZ: 8.151 },
  projects: { height: 31.656, halfX: 26.177, halfZ: 7.564 },
  lamp: { height: 11.085, halfX: 0.244, halfZ: 1.769 },
} as const;

/** Extra meters around every footprint so a mesh cannot clip the road. */
export const SIDE_FOOTPRINT_PAD = 0.08;

/** Meters of open ground required between the road edge and a side prop. */
export const SIDE_ROAD_CLEARANCE = 2.5;

/** Sand ends before the wet shore. Beach props stay on the landward side of this X. */
export const SIDE_BEACH_LIMIT = 17.4;

/**
 * Minimum meters between neighboring building centers.
 * Wide blocks sit farther apart so their meshes keep a sidewalk between them.
 */
export const KIT_STREET_GAP = 8;

/**
 * Open ground between neighboring building meshes, in meters.
 * Applied when an 8 m center spacing would meet or overlap.
 */
export const SIDE_SIDEWALK = 2.5;

/**
 * Beach buildings keep one kit lot out of this many.
 * Two leaves about half the grass-row count, with the skipped lot as the extra gap.
 */
export const BEACH_LOT_STRIDE = 2;

/** Kit FBX order. A building repeats only after this whole row. */
const KIT_BUILDING_ORDER = [
  "projects",
  "apartments",
  "pawn",
  "paramount",
  "liquor",
  "gunshop",
  "laundry",
  "housing",
  "factory",
  "clinic",
] as const satisfies readonly SidePropId[];

/**
 * Sidewalks that receive one lamp, counted from projects toward apartments.
 * These slots keep the beach row from stacking a lamp on the same tile.
 */
const LAMP_GAPS = [1, 2, 4, 6, 8, 9] as const;

/**
 * GLB axis that runs along the street in the FBX.
 * Liquor and paramount were exported with that axis on local Z.
 */
const STREET_ALONG_X = new Set<SidePropId>([
  "projects",
  "apartments",
  "pawn",
  "gunshop",
  "laundry",
  "housing",
  "factory",
  "clinic",
]);

export type SideFootprint = {
  id: SidePropId;
  spawn: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

function fittedLocalHalves(id: SidePropId) {
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

function sideYaw(id: SidePropId, side: -1 | 1) {
  if (id === "lamp") return 0;
  if (STREET_ALONG_X.has(id)) return side < 0 ? Math.PI / 2 : -Math.PI / 2;
  return side < 0 ? 0 : Math.PI;
}

function axisHalf(id: SidePropId, yaw: number, along: boolean) {
  const local = fittedLocalHalves(id);
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  return along ? local.halfX * s + local.halfZ * c : local.halfX * c + local.halfZ * s;
}

function sideCenter(id: SidePropId, side: -1 | 1, yaw: number) {
  const magnitude = roadOuterEdge() + SIDE_ROAD_CLEARANCE + axisHalf(id, yaw, false) + SIDE_FOOTPRINT_PAD;
  return side * (magnitude + 1e-4);
}

function alongHalf(id: SidePropId) {
  return axisHalf(id, sideYaw(id, -1), true);
}

/** Center spacing. Keeps 8 m when the pair fits, otherwise the meshes plus one sidewalk. */
function neighborCenterGap(previous: SidePropId, next: SidePropId) {
  return Math.max(KIT_STREET_GAP, alongHalf(previous) + alongHalf(next) + SIDE_SIDEWALK);
}

/**
 * Lot centers along the street, meters from the projects block.
 * Same kit order. A step is 8 m, or wider when the two meshes need a sidewalk.
 */
export const KIT_STREET_LOTS: readonly { id: SidePropId; at: number }[] = (() => {
  const lots: { id: SidePropId; at: number }[] = [];
  for (const id of KIT_BUILDING_ORDER) {
    const previous = lots[lots.length - 1];
    const at = previous ? previous.at + neighborCenterGap(previous.id, id) : 0;
    lots.push({ id, at });
  }
  return lots;
})();

/** Distance from the projects lot to the next projects lot, including the closing sidewalk. */
export function kitRowPeriod() {
  const first = KIT_STREET_LOTS[0];
  const last = KIT_STREET_LOTS[KIT_STREET_LOTS.length - 1];
  if (!first || !last) return KIT_STREET_GAP;
  return last.at - first.at + neighborCenterGap(last.id, first.id);
}

/** Kit lots that receive a beach building. The skipped lots are the extra sand gaps. */
function beachSlots() {
  return KIT_STREET_LOTS.filter((_, index) => index % BEACH_LOT_STRIDE === 0);
}

/**
 * Distance before the first beach building repeats.
 * The row is long enough to place every kit building once on the kept lots.
 */
export function beachRowPeriod() {
  const slots = beachSlots();
  if (slots.length === 0) return kitRowPeriod();
  return Math.ceil(KIT_BUILDING_ORDER.length / slots.length) * kitRowPeriod();
}

/**
 * Kit order parked on every other lot.
 * `phase` rotates which building sits on the first kept lot so the beach
 * does not put the same mesh on the same tile as the grass row.
 */
function beachLotsForPhase(phase: number) {
  const period = kitRowPeriod();
  const slots = beachSlots();
  const lots: { id: SidePropId; at: number }[] = [];
  if (slots.length === 0) return lots;
  for (let index = 0; index < KIT_BUILDING_ORDER.length; index += 1) {
    const id = KIT_BUILDING_ORDER[(phase + index) % KIT_BUILDING_ORDER.length];
    const slot = slots[index % slots.length];
    if (!id || !slot) continue;
    lots.push({ id, at: slot.at + Math.floor(index / slots.length) * period });
  }
  return lots;
}

function beachPhaseCrowds(phase: number, tileSize: number, shift: number) {
  const leftPeriod = kitRowPeriod();
  const rightPeriod = beachRowPeriod();
  const right = beachLotsForPhase(phase);
  const leftOnTile = new Map<number, SidePropId>();
  for (const lot of KIT_STREET_LOTS) {
    for (let step = -6; step <= 8; step += 1) {
      const along = lot.at + step * leftPeriod;
      leftOnTile.set(Math.floor(along / tileSize + 1e-8), lot.id);
    }
  }
  return right.some((beach) => {
    for (let repeat = -1; repeat <= 2; repeat += 1) {
      const along = beach.at + shift + repeat * rightPeriod;
      const owner = Math.floor(along / tileSize + 1e-8);
      if (leftOnTile.get(owner) === beach.id) return true;
    }
    return false;
  });
}

const beachPhaseByTile = new Map<string, number>();

function beachKitPhase(tileSize: number, shift: number) {
  const key = `${tileSize}:${shift}`;
  const cached = beachPhaseByTile.get(key);
  if (cached !== undefined) return cached;
  let phase = 0;
  for (let candidate = 0; candidate < KIT_BUILDING_ORDER.length; candidate += 1) {
    if (!beachPhaseCrowds(candidate, tileSize, shift)) {
      phase = candidate;
      break;
    }
  }
  beachPhaseByTile.set(key, phase);
  return phase;
}

/** One lamp in the middle of each chosen sidewalk. Same lamp mesh. */
const KIT_LAMPS: readonly { at: number }[] = (() => {
  const period = kitRowPeriod();
  const mids: number[] = [];
  for (let index = 0; index < KIT_STREET_LOTS.length; index += 1) {
    const current = KIT_STREET_LOTS[index];
    const next = KIT_STREET_LOTS[(index + 1) % KIT_STREET_LOTS.length];
    if (!current || !next) continue;
    const nextAt = index + 1 < KIT_STREET_LOTS.length ? next.at : period;
    const start = current.at + alongHalf(current.id);
    const end = nextAt - alongHalf(next.id);
    mids.push((start + end) / 2);
  }
  return LAMP_GAPS.flatMap((gap) => {
    const at = mids[gap];
    return at === undefined ? [] : [{ at }];
  });
})();

function circularDistance(a: number, b: number, period: number) {
  const delta = Math.abs(a - b) % period;
  return Math.min(delta, period - delta);
}

/** A beach lamp that would sit inside a building footprint is left out. */
function beachLampBlocked(
  along: number,
  shift: number,
  buildings: readonly { id: SidePropId; at: number }[],
  period: number,
) {
  const lampReach = alongHalf("lamp") + SIDE_FOOTPRINT_PAD;
  return buildings.some((building) => {
    const distance = circularDistance(along, building.at + shift, period);
    return distance <= alongHalf(building.id) + SIDE_FOOTPRINT_PAD + lampReach;
  });
}

/**
 * Beach row is the same street, opened at the factory so the paths do not
 * mirror one building. Whole segments of nudge keep lamps off the same tile.
 */
export function beachRowShift(tileSize = tuning.tileSize) {
  const period = kitRowPeriod();
  const factory = KIT_STREET_LOTS.find((lot) => lot.id === "factory");
  const base = -(factory?.at ?? 0);
  for (let step = 0; step < 6; step += 1) {
    const shift = base + step * tileSize;
    const crowded = KIT_LAMPS.some((left) =>
      KIT_LAMPS.some((right) => circularDistance(left.at, right.at + shift, period) < tileSize),
    );
    if (!crowded) return shift;
  }
  return base + 2 * tileSize;
}

type StreetMarker = { id: SidePropId; at: number };

function streetMarkers(): StreetMarker[] {
  return [...KIT_STREET_LOTS, ...KIT_LAMPS.map((lamp) => ({ id: "lamp" as const, at: lamp.at }))];
}

/**
 * Props for one road segment. Spawn index only — the obstacle seed is not read.
 * The grass row keeps every kit lot. The beach keeps every other lot, in kit
 * order, so a mesh repeats only after the whole row.
 */
export function sidePlacements(spawn: number, tileSize = tuning.tileSize): readonly SidePlacement[] {
  const period = kitRowPeriod();
  const beachPeriod = beachRowPeriod();
  const beachShift = beachRowShift(tileSize);
  const beachBuildings = beachLotsForPhase(beachKitPhase(tileSize, beachShift));
  const origin = spawn * tileSize;
  const placed: SidePlacement[] = [];
  const used = new Set<SidePropId>();
  const rows: { side: -1 | 1; shift: number; period: number; markers: StreetMarker[] }[] = [
    { side: -1, shift: 0, period, markers: streetMarkers() },
    { side: 1, shift: beachShift, period: beachPeriod, markers: beachBuildings },
    {
      side: 1,
      shift: beachShift,
      period,
      markers: KIT_LAMPS.map((lamp) => ({ id: "lamp" as const, at: lamp.at })),
    },
  ];
  for (const row of rows) {
    for (const marker of row.markers) {
      const base = marker.at + row.shift;
      const k = Math.round((origin - base) / row.period);
      for (const step of [k - 1, k, k + 1]) {
        const along = base + step * row.period;
        const owner = Math.floor(along / tileSize + 1e-8);
        if (owner !== spawn || used.has(marker.id)) continue;
        if (row.side > 0 && marker.id === "lamp" && beachLampBlocked(along, beachShift, beachBuildings, beachPeriod)) {
          continue;
        }
        used.add(marker.id);
        const yaw = sideYaw(marker.id, row.side);
        placed.push({
          id: marker.id,
          x: sideCenter(marker.id, row.side, yaw),
          z: origin - along,
          yaw,
        });
      }
    }
  }
  return placed;
}

/** Outer edge of the three road tiles. Matches the road width already in the course. */
export function roadOuterEdge(tileSize = tuning.tileSize, laneSpacing = tuning.laneSpacing) {
  return laneSpacing + (tileSize * 1.02) / 2;
}

export function sideFootprints(spawn: number, tileSize = tuning.tileSize): SideFootprint[] {
  const segmentZ = -spawn * tileSize;
  return sidePlacements(spawn, tileSize).map((placement) => {
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
