import { describe, expect, it } from "vitest";
import { fitRunnerTuning as tuning } from "./tuning";
import {
  BEACH_LOT_STRIDE,
  KIT_STREET_GAP,
  KIT_STREET_LOTS,
  OBSTACLE_KINDS,
  SIDE_BEACH_LIMIT,
  SIDE_FOOTPRINT_PAD,
  SIDE_PROP_IDS,
  SIDE_ROAD_CLEARANCE,
  SIDE_SIDEWALK,
  beachRowPeriod,
  clearanceFromRoad,
  footprintsOverlap,
  kitRowPeriod,
  roadOuterEdge,
  sideFootprints,
  sidePlacements,
} from "./side-scenery";

function alongOf(spawn: number, z: number) {
  return spawn * tuning.tileSize - z;
}

function row(side: "left" | "right", spawnCount: number) {
  const items = [];
  for (let spawn = 0; spawn < spawnCount; spawn += 1) {
    for (const placement of sidePlacements(spawn)) {
      const onSide = side === "left" ? placement.x < 0 : placement.x > 0;
      if (!onSide || placement.id === "lamp") continue;
      items.push({ id: placement.id, along: alongOf(spawn, placement.z) });
    }
  }
  items.sort((a, b) => a.along - b.along);
  return items;
}

function buildingEdges(side: "left" | "right", spawnCount: number) {
  const items = [];
  for (let spawn = 0; spawn < spawnCount; spawn += 1) {
    for (const box of sideFootprints(spawn)) {
      if (box.id === "lamp") continue;
      const onSide = side === "left" ? box.maxX < 0 : box.minX > 0;
      if (!onSide) continue;
      items.push({
        along: -((box.minZ + box.maxZ) / 2),
        half: (box.maxZ - box.minZ) / 2,
      });
    }
  }
  items.sort((a, b) => a.along - b.along);
  return items.slice(1).map((item, index) => {
    const previous = items[index];
    if (!previous) return 0;
    return item.along - item.half - (previous.along + previous.half);
  });
}

describe("side city scenery", () => {
  const period = kitRowPeriod();
  const beachPeriod = beachRowPeriod();
  const spawnCount = Math.ceil(beachPeriod / tuning.tileSize) + 4;

  it("keeps kit order and puts neighboring centers about 8 m apart", () => {
    expect(KIT_STREET_GAP).toBe(8);
    expect(SIDE_SIDEWALK).toBe(2.5);
    expect(KIT_STREET_LOTS.map((lot) => lot.id)).toEqual([
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
    ]);
    const left = row("left", spawnCount).filter((item) => item.along < period - 0.01);
    expect(left.map((item) => item.id)).toEqual(KIT_STREET_LOTS.map((lot) => lot.id));
    const repeated = row("left", spawnCount).find((item) => item.along >= period - 0.01);
    expect(repeated?.id).toBe("projects");
    for (let index = 1; index < KIT_STREET_LOTS.length; index += 1) {
      const previous = KIT_STREET_LOTS[index - 1];
      const current = KIT_STREET_LOTS[index];
      if (!previous || !current) continue;
      expect(current.at - previous.at).toBeGreaterThanOrEqual(KIT_STREET_GAP);
    }
    const gaps = left.slice(1).map((item, index) => item.along - (left[index]?.along ?? item.along));
    expect(Math.min(...gaps)).toBeCloseTo(KIT_STREET_GAP, 1);
    expect(Math.max(...gaps)).toBeLessThan(16);
    const edges = buildingEdges("left", spawnCount);
    expect(Math.min(...edges)).toBeGreaterThanOrEqual(SIDE_SIDEWALK - 2 * SIDE_FOOTPRINT_PAD - 0.01);
  });

  it("keeps the beach row in kit order, about half as dense, with wider gaps", () => {
    expect(BEACH_LOT_STRIDE).toBe(2);
    expect(beachPeriod).toBe(period * 2);
    const within = (side: "left" | "right") =>
      row(side, spawnCount).filter((item) => item.along >= -0.01 && item.along < beachPeriod - 0.01);
    const left = within("left");
    const beach = within("right");
    expect(left.length).toBe(KIT_STREET_LOTS.length * 2);
    expect(beach.length).toBe(KIT_STREET_LOTS.length);
    expect(beach.length * 2).toBe(left.length);
    const ids = beach.map((item) => item.id);
    expect(new Set(ids).size).toBe(KIT_STREET_LOTS.length);
    const order = KIT_STREET_LOTS.map((lot) => lot.id).join(",");
    expect(`${order},${order}`.includes(ids.join(","))).toBe(true);
    const leftGaps = left.slice(1).map((item, index) => item.along - (left[index]?.along ?? item.along));
    const beachGaps = beach.slice(1).map((item, index) => item.along - (beach[index]?.along ?? item.along));
    expect(Math.min(...beachGaps)).toBeGreaterThan(Math.max(...leftGaps));
    const edges = buildingEdges("right", spawnCount);
    expect(Math.min(...edges)).toBeGreaterThanOrEqual(SIDE_SIDEWALK - 2 * SIDE_FOOTPRINT_PAD - 0.01);
    const sameTile = beach.some((item) =>
      left.some((other) => other.id === item.id && Math.abs(other.along - item.along) < tuning.tileSize),
    );
    expect(sameTile).toBe(false);
  });

  it("keeps every prop outside the road, the lanes, and the other props", () => {
    const edge = roadOuterEdge();
    expect(edge).toBeCloseTo(tuning.laneSpacing + (tuning.tileSize * 1.02) / 2, 5);
    const boxes = [];
    let sawLeft = false;
    let sawRight = false;
    for (let spawn = 0; spawn < spawnCount; spawn += 1) {
      const placed = sidePlacements(spawn);
      expect(new Set(placed.map((placement) => placement.id)).size).toBe(placed.length);
      for (const placement of placed) {
        expect(SIDE_PROP_IDS).toContain(placement.id);
        expect(OBSTACLE_KINDS).not.toContain(placement.id);
        if (placement.x < 0) sawLeft = true;
        if (placement.x > 0) sawRight = true;
      }
      const footprints = sideFootprints(spawn);
      for (const box of footprints) {
        expect(clearanceFromRoad(box, edge)).toBeGreaterThanOrEqual(SIDE_ROAD_CLEARANCE);
        if (box.minX > 0) expect(box.maxX).toBeLessThanOrEqual(SIDE_BEACH_LIMIT);
        for (const laneX of [-tuning.laneSpacing, 0, tuning.laneSpacing]) {
          const gap = box.minX > laneX ? box.minX - laneX : laneX - box.maxX;
          expect(gap).toBeGreaterThan(tuning.laneSpacing);
        }
      }
      boxes.push(...footprints);
    }
    expect(sawLeft).toBe(true);
    expect(sawRight).toBe(true);
    for (let index = 0; index < boxes.length; index += 1) {
      for (let other = index + 1; other < boxes.length; other += 1) {
        const a = boxes[index];
        const b = boxes[other];
        if (!a || !b) continue;
        expect(footprintsOverlap(a, b), `${a.id}@${a.spawn} overlaps ${b.id}@${b.spawn}`).toBe(false);
      }
    }
  });

  it("puts a readable building on each path within the first block", () => {
    const early = [];
    for (let spawn = 0; spawn < 8; spawn += 1) early.push(...sidePlacements(spawn));
    expect(early.some((placement) => placement.x < 0 && placement.id !== "lamp")).toBe(true);
    expect(early.some((placement) => placement.x > 0 && placement.id !== "lamp")).toBe(true);
  });

  it("does not spend the obstacle pad on the playable lanes", () => {
    expect(SIDE_FOOTPRINT_PAD).toBeGreaterThan(0);
    const edge = roadOuterEdge();
    for (let spawn = 0; spawn < spawnCount; spawn += 1) {
      for (const box of sideFootprints(spawn)) {
        expect(box.maxX < -edge || box.minX > edge).toBe(true);
      }
    }
  });
});
