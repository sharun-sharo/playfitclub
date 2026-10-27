import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { fitRunnerTuning as tuning } from "./tuning";
import {
  COTTAGE_PIECES,
  OBSTACLE_KINDS,
  SIDE_FOOTPRINT_PAD,
  SIDE_PROP_IDS,
  SIDE_ROAD_CLEARANCE,
  clearanceFromRoad,
  cottageLocalBounds,
  footprintsOverlap,
  roadOuterEdge,
  sideFootprints,
  sidePlacements,
} from "./side-scenery";

const PART_SIZE = {
  wall: { x: 0.2, y: 1, z: 1, originY: 0.5 },
  window: { x: 0.3, y: 1, z: 1, originY: 0.5 },
  doorway: { x: 0.3, y: 1, z: 1, originY: 0.5 },
  column: { x: 0.2, y: 1, z: 0.2, originY: 0.5 },
} as const;

describe("side kit scenery", () => {
  it("matches the cottage piece bounds three.js will fit", () => {
    const group = new THREE.Group();
    for (const piece of COTTAGE_PIECES) {
      const size = PART_SIZE[piece.part];
      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      geometry.translate(0, size.originY, 0);
      const mesh = new THREE.Mesh(geometry);
      mesh.position.set(piece.x, piece.y, piece.z);
      mesh.rotation.y = piece.yaw;
      mesh.scale.set(piece.sx, piece.sy, piece.sz);
      group.add(mesh);
    }
    const box = new THREE.Box3().setFromObject(group);
    const bounds = cottageLocalBounds();
    expect(box.min.x).toBeCloseTo(bounds.minX, 5);
    expect(box.max.x).toBeCloseTo(bounds.maxX, 5);
    expect(box.min.y).toBeCloseTo(bounds.minY, 5);
    expect(box.max.y).toBeCloseTo(bounds.maxY, 5);
    expect(box.min.z).toBeCloseTo(bounds.minZ, 5);
    expect(box.max.z).toBeCloseTo(bounds.maxZ, 5);
  });

  it("keeps every prop outside the road, the lanes, and the other props", () => {
    const edge = roadOuterEdge();
    expect(edge).toBeCloseTo(tuning.laneSpacing + (tuning.tileSize * 1.02) / 2, 5);
    const boxes = [];
    for (let spawn = 0; spawn < 24; spawn += 1) {
      const placed = sidePlacements(spawn);
      expect(placed.length).toBeGreaterThan(0);
      for (const placement of placed) {
        expect(SIDE_PROP_IDS).toContain(placement.id);
        expect(OBSTACLE_KINDS).not.toContain(placement.id);
      }
      const footprints = sideFootprints(spawn);
      for (const box of footprints) {
        expect(clearanceFromRoad(box, edge)).toBeGreaterThanOrEqual(SIDE_ROAD_CLEARANCE);
        for (const laneX of [-tuning.laneSpacing, 0, tuning.laneSpacing]) {
          const gap = box.minX > laneX ? box.minX - laneX : laneX - box.maxX;
          expect(gap).toBeGreaterThan(tuning.laneSpacing);
        }
      }
      boxes.push(...footprints);
    }
    for (let index = 0; index < boxes.length; index += 1) {
      for (let other = index + 1; other < boxes.length; other += 1) {
        const a = boxes[index];
        const b = boxes[other];
        if (!a || !b) continue;
        if (Math.abs(a.spawn - b.spawn) > 4) continue;
        expect(footprintsOverlap(a, b), `${a.id}@${a.spawn} overlaps ${b.id}@${b.spawn}`).toBe(false);
      }
    }
  });

  it("does not spend the obstacle pad on the playable lanes", () => {
    expect(SIDE_FOOTPRINT_PAD).toBeGreaterThan(0);
    const edge = roadOuterEdge();
    for (const box of sideFootprints(0)) {
      expect(box.maxX < -edge || box.minX > edge).toBe(true);
    }
  });
});
