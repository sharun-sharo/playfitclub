import { CARGO_HIT_M, OBSTACLE_DEPTH_M } from "@fitplay/shared";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createObstacle, type ObstacleKind } from "./obstacle-meshes";
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

  it("lets a recycled obstacle take a new curated theme without recoloring another", () => {
    const recycled = createObstacle("rock");
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
