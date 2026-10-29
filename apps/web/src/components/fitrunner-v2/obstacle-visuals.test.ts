import { CARGO_HIT_M, OBSTACLE_DEPTH_M } from "@fitplay/shared";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createObstacle,
  fitLaneCarHit,
  LANE_CAR_HEIGHT_M,
  LANE_CAR_MAX_WIDTH_M,
  layoutRoadBlock,
  ROAD_BLOCK_MODELS,
  roadBlockNameForOrdinal,
  type ObstacleKind,
} from "./obstacle-meshes";
import {
  applyObstacleTheme,
  isCuratedObstacleHex,
  OBSTACLE_PALETTES,
  OBSTACLE_VARIANTS,
  obstacleMaterialCacheSize,
  resetObstacleThemeSequence,
  takeObstacleTheme,
} from "./obstacle-themes";
import { fitRunnerTuning } from "./tuning";

const KINDS: ObstacleKind[] = ["log", "fence", "rock"];

/** Sizes the course used before this visual pass. Thickness and center are part of the hit box. */
const HIT = {
  log: { width: 2.05, height: 0.11, depth: 0.16, y: 0.4 - 0.055 },
  fence: { width: 2.05, height: 0.16, depth: 0.18, y: 1.28 + 0.08 },
  rock: { width: 2.2, height: 2.78, depth: 1.18, y: 2.78 / 2 },
} as const;

function hitMesh(root: THREE.Object3D) {
  const found: THREE.Mesh[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.name === "hit") found.push(mesh);
  });
  expect(found).toHaveLength(1);
  const mesh = found[0];
  if (!mesh) throw new Error("missing hit");
  return mesh;
}

function painted(root: THREE.Object3D, role: string) {
  let found: THREE.Mesh | null = null;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.userData.paint === role) found = mesh;
  });
  if (!found) throw new Error(`missing ${role}`);
  return found;
}

function meshFromGlb(fileName: string) {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../public/assets/fitrunner/road-blocks", fileName);
  const data = fs.readFileSync(file);
  let offset = 12;
  let json: {
    accessors: Array<{ bufferView?: number; byteOffset?: number; count: number; componentType: number; type: string }>;
    bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }>;
    meshes?: Array<{ primitives?: Array<{ attributes?: { POSITION?: number } }> }>;
  } | null = null;
  let bin: Buffer | null = null;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.toString("utf8", offset + 4, offset + 8);
    offset += 8;
    const chunk = data.subarray(offset, offset + length);
    offset += length;
    if (type === "JSON") json = JSON.parse(chunk.toString("utf8"));
    if (type === "BIN\u0000") bin = chunk;
  }
  if (!json || !bin) throw new Error(`missing glb chunks in ${fileName}`);
  const group = new THREE.Group();
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  for (const primitive of primitives) {
    const accessorIndex = primitive.attributes?.POSITION;
    if (accessorIndex === undefined) continue;
    const accessor = json.accessors[accessorIndex];
    if (!accessor || accessor.bufferView === undefined) continue;
    const view = json.bufferViews[accessor.bufferView];
    if (!view) continue;
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = view.byteStride ?? 12;
    const positions = new Float32Array(accessor.count * 3);
    for (let index = 0; index < accessor.count; index += 1) {
      const at = start + index * stride;
      positions[index * 3] = bin.readFloatLE(at);
      positions[index * 3 + 1] = bin.readFloatLE(at + 4);
      positions[index * 3 + 2] = bin.readFloatLE(at + 8);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  }
  if (!group.children.length) throw new Error(`missing positions in ${fileName}`);
  return group;
}

function standardColors(root: THREE.Object3D) {
  const colors: string[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      colors.push(material.color.getHexString(), material.emissive.getHexString());
    }
  });
  return colors;
}

describe("fit run obstacle visuals", () => {
  it("keeps every obstacle hit box at its previous size", () => {
    expect(fitRunnerTuning.props.log).toEqual({ x: 2.05, y: 0.4, z: 0.16 });
    expect(fitRunnerTuning.props.fence).toEqual({ x: 2.05, y: 1.62, z: 0.18 });
    expect(fitRunnerTuning.fenceGap).toBe(1.28);
    expect(fitRunnerTuning.props.blocker).toEqual({ x: 2.2, y: 2.78, z: 1.18 });
    expect(fitRunnerTuning.forwardSpeed).toBe(6.15);
    expect(fitRunnerTuning.maxSpeed).toBe(8.2);
    expect(fitRunnerTuning.speedGain).toBe(0.045);
    expect(OBSTACLE_DEPTH_M).toEqual({ log: 0.16, fence: 0.18, rock: 1.18 });
    expect(CARGO_HIT_M).toEqual({ x: 2.2, y: 2.78, z: 1.18 });

    for (const kind of KINDS) {
      const obstacle = createObstacle(kind);
      const hit = hitMesh(obstacle);
      const geometry = hit.geometry as THREE.BoxGeometry;
      const expected = HIT[kind];
      expect(obstacle.scale.toArray()).toEqual([1, 1, 1]);
      expect(hit.scale.toArray()).toEqual([1, 1, 1]);
      expect(hit.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
      expect(hit.position.x).toBe(0);
      expect(hit.position.z).toBe(0);
      expect(geometry.parameters.width).toBeCloseTo(expected.width, 5);
      expect(geometry.parameters.height).toBeCloseTo(expected.height, 5);
      expect(geometry.parameters.depth).toBeCloseTo(expected.depth, 5);
      expect(hit.position.y).toBeCloseTo(expected.y, 5);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox;
      if (!bounds) throw new Error("missing bounds");
      expect(bounds.min.y).toBeCloseTo(-expected.height / 2, 5);
      expect(bounds.max.y).toBeCloseTo(expected.height / 2, 5);
      expect((hit.material as THREE.MeshBasicMaterial).colorWrite).toBe(false);
    }
  });

  it("shares one geometry per kind and does not grow a material per obstacle", () => {
    const first = createObstacle("log");
    const second = createObstacle("log");
    expect(hitMesh(first).geometry).toBe(hitMesh(second).geometry);
    expect(painted(first, "body").geometry).toBe(painted(second, "body").geometry);

    const before = obstacleMaterialCacheSize();
    for (let index = 0; index < 24; index += 1) createObstacle(KINDS[index % KINDS.length] ?? "rock");
    expect(obstacleMaterialCacheSize()).toBeLessThanOrEqual(6 * 3 * 7 + 6);
    expect(obstacleMaterialCacheSize()).toBeGreaterThanOrEqual(before);
  });

  it("keeps the lane blocker on the road-block pictures without resizing the hit box", () => {
    expect(ROAD_BLOCK_MODELS.map((model) => model.url)).toEqual([
      "/assets/fitrunner/road-blocks/old-rusty-car.glb",
      "/assets/fitrunner/road-blocks/old-car-vaz-2107.glb",
      "/assets/fitrunner/road-blocks/car-scene.glb",
      "/assets/fitrunner/road-blocks/destroyed-car-07.glb",
    ]);
    const names = Array.from({ length: 8 }, (_, ordinal) => roadBlockNameForOrdinal(ordinal));
    expect(names).toEqual([
      "old-rusty-car",
      "old-car-vaz-2107",
      "car-scene",
      "destroyed-car-07",
      "old-rusty-car",
      "old-car-vaz-2107",
      "car-scene",
      "destroyed-car-07",
    ]);
    for (let ordinal = 1; ordinal < names.length; ordinal += 1) {
      expect(names[ordinal]).not.toBe(names[ordinal - 1]);
    }
    const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../public");
    for (const model of ROAD_BLOCK_MODELS) {
      const file = path.join(publicRoot, model.url.slice(1));
      expect(fs.existsSync(file), file).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(10_000);
    }

    const first = createObstacle("rock");
    const second = createObstacle("rock");
    expect(first.name).toBe("blocker");
    expect(hitMesh(first).geometry).toBe(hitMesh(second).geometry);
    expect(hitMesh(first).position.y).toBeCloseTo(2.78 / 2, 5);
    let paintedRoles = 0;
    first.traverse((child) => {
      if (child.userData.paint) paintedRoles += 1;
    });
    expect(paintedRoles).toBe(0);
    expect((hitMesh(first).geometry as THREE.BoxGeometry).parameters).toMatchObject({
      width: 2.2,
      height: 2.78,
      depth: 1.18,
    });
  });

  it("sits each car in one lane and fits the hit box to the visible body", () => {
    for (const model of ROAD_BLOCK_MODELS) {
      const car = meshFromGlb(`${model.name}.glb`);
      const placed = layoutRoadBlock(car, model);
      placed.name = "road-block";
      const obstacle = createObstacle("rock");
      const existing = obstacle.getObjectByName("road-block");
      if (existing) obstacle.remove(existing);
      obstacle.add(placed);
      fitLaneCarHit(obstacle);
      obstacle.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(placed);
      const size = box.getSize(new THREE.Vector3());
      const scaled = placed.children[0] as THREE.Object3D;
      expect(scaled.scale.x, model.name).toBeCloseTo(scaled.scale.y, 5);
      expect(scaled.scale.y, model.name).toBeCloseTo(scaled.scale.z, 5);
      expect(size.y, model.name).toBeGreaterThanOrEqual(1.4);
      expect(size.y, model.name).toBeLessThanOrEqual(LANE_CAR_HEIGHT_M + 0.001);
      expect(size.x, model.name).toBeGreaterThan(1.1);
      expect(size.x, model.name).toBeLessThanOrEqual(LANE_CAR_MAX_WIDTH_M + 0.001);
      expect(size.z, model.name).toBeGreaterThan(size.x);
      expect(size.y, model.name).toBeLessThan(2);
      expect(box.min.y, model.name).toBeCloseTo(0, 2);
      expect((box.min.x + box.max.x) / 2, model.name).toBeCloseTo(0, 2);
      expect((box.min.z + box.max.z) / 2, model.name).toBeCloseTo(0, 2);
      expect(size.x / 2 + 0.55, model.name).toBeLessThan(fitRunnerTuning.laneSpacing);

      const hit = hitMesh(obstacle);
      if (!hit.geometry.boundingBox) hit.geometry.computeBoundingBox();
      const local = hit.geometry.boundingBox;
      if (!local) throw new Error("missing hit bounds");
      const hitBox = local.clone().applyMatrix4(hit.matrixWorld);
      expect(hitBox.min.x, model.name).toBeCloseTo(box.min.x, 2);
      expect(hitBox.max.x, model.name).toBeCloseTo(box.max.x, 2);
      expect(hitBox.min.y, model.name).toBeCloseTo(box.min.y, 2);
      expect(hitBox.max.y, model.name).toBeCloseTo(box.max.y, 2);
      expect(hitBox.min.z, model.name).toBeCloseTo(box.min.z, 2);
      expect(hitBox.max.z, model.name).toBeCloseTo(box.max.z, 2);
    }
  });

  it("lets a recycled obstacle take a new curated theme without recoloring another", () => {
    const recycled = createObstacle("log");
    const neighbor = createObstacle("fence");
    const hitGeometry = hitMesh(recycled).geometry;
    const hitY = hitMesh(recycled).position.y;

    applyObstacleTheme(recycled, { palette: 0, variant: 0 });
    applyObstacleTheme(neighbor, { palette: 0, variant: 0 });
    const shared = painted(neighbor, "body").material as THREE.MeshStandardMaterial;
    const sharedHex = shared.color.getHexString();
    expect(painted(recycled, "body").material).toBe(shared);
    expect(recycled.userData.themeId).toBe("tropical");

    applyObstacleTheme(recycled, { palette: 4, variant: 2 });
    const next = painted(recycled, "body").material as THREE.MeshStandardMaterial;
    expect(next).not.toBe(shared);
    expect(next.color.getHexString()).not.toBe(sharedHex);
    expect(painted(neighbor, "body").material).toBe(shared);
    expect(shared.color.getHexString()).toBe(sharedHex);
    expect(recycled.userData.themeId).toBe("candy");
    expect(hitMesh(recycled).geometry).toBe(hitGeometry);
    expect(hitMesh(recycled).position.y).toBe(hitY);

    for (const kind of KINDS) {
      const obstacle = createObstacle(kind);
      for (let palette = 0; palette < OBSTACLE_PALETTES.length; palette += 1) {
        for (let variant = 0; variant < OBSTACLE_VARIANTS.length; variant += 1) {
          applyObstacleTheme(obstacle, { palette, variant });
          for (const hex of standardColors(obstacle)) expect(isCuratedObstacleHex(hex)).toBe(true);
        }
      }
    }
    const settled = obstacleMaterialCacheSize();
    applyObstacleTheme(recycled, { palette: 4, variant: 2 });
    expect(obstacleMaterialCacheSize()).toBe(settled);
  });

  it("can give consecutive spawns different palettes, using only the six arrangements", () => {
    for (const variant of OBSTACLE_VARIANTS) {
      expect(new Set(Object.values(variant))).toEqual(new Set(["primary", "secondary", "trim", "accent"]));
    }
    expect(OBSTACLE_PALETTES.map((palette) => palette.name)).toEqual([
      "Tropical Pop",
      "Neon Arcade",
      "Coastal Sunset",
      "Cyber Sport",
      "Candy Rush",
      "Industrial Racing",
    ]);

    resetObstacleThemeSequence();
    const zero = takeObstacleTheme(() => 0);
    const next = takeObstacleTheme(() => 0);
    expect(zero.palette).not.toBe(next.palette);

    resetObstacleThemeSequence();
    let seed = 0.17;
    const picks = Array.from({ length: 12 }, () =>
      takeObstacleTheme(() => {
        seed = (seed * 13.1) % 1;
        return seed;
      }),
    );
    for (let index = 1; index < picks.length; index += 1) {
      expect(picks[index]?.palette).not.toBe(picks[index - 1]?.palette);
    }
    for (const pick of picks) {
      expect(pick.palette).toBeGreaterThanOrEqual(0);
      expect(pick.palette).toBeLessThan(OBSTACLE_PALETTES.length);
      expect(pick.variant).toBeGreaterThanOrEqual(0);
      expect(pick.variant).toBeLessThan(OBSTACLE_VARIANTS.length);
    }
  });
});
