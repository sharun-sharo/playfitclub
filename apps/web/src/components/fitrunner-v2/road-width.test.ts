import { describe, expect, it } from "vitest";
import { roadLayout } from "./road-width";
import { SIDE_ROAD_CLEARANCE, roadOuterEdge } from "./side-scenery";
import { fitRunnerTuning as tuning } from "./tuning";

describe("fit run road width", () => {
  it("keeps the lanes put and sets the gate posts fully on the asphalt", () => {
    const road = roadLayout();
    const footInner = road.laneSpacing + 1.04 - 0.16;
    expect(tuning.laneSpacing).toBe(3);
    expect(road.laneSpacing).toBe(tuning.laneSpacing);
    expect(road.obstacleReach).toBeCloseTo(4.2, 5);
    expect(road.roadEdge - road.obstacleReach).toBeCloseTo(0.25, 5);
    expect(road.lipInner).toBe(road.roadEdge);
    expect(road.shoulderInner).toBeLessThan(footInner);
    expect(road.shoulderOuter).toBeGreaterThan(road.obstacleReach);
    expect(road.groundEdge).toBeGreaterThan(road.roadEdge);
    expect(road.groundEdge - road.roadEdge).toBeCloseTo(0.34, 5);
  });

  it("keeps scenery at least 2.5 m past the new asphalt edge", () => {
    const road = roadLayout();
    const clearance = roadOuterEdge() + SIDE_ROAD_CLEARANCE - road.roadEdge;
    expect(clearance).toBeGreaterThanOrEqual(2.5);
  });
});
