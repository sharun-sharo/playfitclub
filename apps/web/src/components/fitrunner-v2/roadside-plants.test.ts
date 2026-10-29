import { describe, expect, it } from "vitest";
import { OBSTACLE_KINDS, roadOuterEdge } from "./side-scenery";
import { fitRunnerTuning as tuning } from "./tuning";
import {
  ROADSIDE_PLANTS,
  roadsidePlantClearance,
  roadsidePlantX,
  roadsideVariant,
} from "./roadside-plants";

describe("roadside plants", () => {
  it("uses several different models and none of them are obstacles", () => {
    const ids = ROADSIDE_PLANTS.map((plant) => plant.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(8);
    expect(ids.filter((id) => id.startsWith("cherry"))).toEqual(["cherry-a", "cherry-b", "cherry-c"]);
    expect(ids.some((id) => id.startsWith("palm"))).toBe(true);
    expect(ids.some((id) => id.startsWith("banana"))).toBe(true);
    expect(ids.some((id) => id.startsWith("fern"))).toBe(true);
    expect(ids.some((id) => id.startsWith("monstera"))).toBe(true);
    for (const plant of ROADSIDE_PLANTS) {
      expect(OBSTACLE_KINDS).not.toContain(plant.id);
      expect(plant.url.startsWith("/assets/fitrunner/trees/")).toBe(true);
    }
  });

  it("keeps the canopy at least 2.5 m past the road edge and outside the lanes", () => {
    const edge = roadOuterEdge();
    expect(edge).toBeGreaterThan(4);
    for (const halfReach of [0.4, 1.2, 2.05, 2.6, 3.55, 3.79, 4.11]) {
      for (const scale of [0.96, 1, 1.06]) {
        const clearance = roadsidePlantClearance(halfReach, scale, edge);
        expect(clearance).toBeGreaterThanOrEqual(2.5);
        for (const side of [-1, 1] as const) {
          const center = roadsidePlantX(side, halfReach, scale, edge);
          expect(Math.sign(center)).toBe(side);
          const inner = Math.abs(center) - halfReach * scale;
          expect(inner).toBeGreaterThanOrEqual(edge + 2.5);
          for (const laneX of [-tuning.laneSpacing, 0, tuning.laneSpacing]) {
            expect(inner - Math.abs(laneX)).toBeGreaterThan(tuning.laneSpacing);
          }
        }
      }
    }
  });

  it("changes the model from one plant to the next along the run", () => {
    const seen = new Set<number>();
    let previous = -1;
    for (let spawn = 0; spawn < ROADSIDE_PLANTS.length; spawn += 1) {
      for (let ordinal = 0; ordinal < 4; ordinal += 1) {
        const variant = roadsideVariant(spawn, ordinal);
        expect(variant).toBeGreaterThanOrEqual(0);
        expect(variant).toBeLessThan(ROADSIDE_PLANTS.length);
        if (previous >= 0) expect(variant).not.toBe(previous);
        previous = variant;
        seen.add(variant);
      }
    }
    expect(seen.size).toBe(ROADSIDE_PLANTS.length);
  });
});
