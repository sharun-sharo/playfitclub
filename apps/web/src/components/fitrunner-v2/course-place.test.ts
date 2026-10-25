import { describe, expect, it } from "vitest";
import { distanceAt, PREP_S, scheduleContains, scheduleCourse } from "@fitplay/shared";
import { obstaclesForTile } from "./course-place";

describe("course tiles past the first chunk", () => {
  it("meshes an obstacle ahead for 60 seconds, including tiles after the opening 22", () => {
    const tileSize = 3;
    const segmentCount = 22;
    const recycleBehind = 10;
    const course = scheduleCourse({ seed: 4, ceiling: "beginner", untilTimeS: 75 });
    expect(course.valid, course.reasons.join(",")).toBe(true);
    expect(distanceAt(60)).toBeGreaterThan(400);
    const segments = Array.from({ length: segmentCount }, (_, spawn) => ({
      spawn,
      z: tileSize * 2 - spawn * tileSize,
    }));
    let nextSpawn = segmentCount;
    for (let second = 0; second <= 60; second += 1) {
      const distance = distanceAt(second);
      const runnerZ = -distance;
      for (let guard = 0; guard < segmentCount; guard += 1) {
        let back = segments[0];
        let front = segments[0];
        if (!back || !front) throw new Error("missing tile");
        for (const segment of segments) {
          if (segment.z > back.z) back = segment;
          if (segment.z < front.z) front = segment;
        }
        if (back.z <= runnerZ + recycleBehind) break;
        back.z = front.z - tileSize;
        back.spawn = nextSpawn;
        nextSpawn += 1;
      }
      const ahead = course.obstacles.filter((item) => item.distanceM > distance + 1 && item.distanceM < distance + 45);
      expect(ahead.length, `t=${second}`).toBeGreaterThan(0);
      for (const item of ahead) {
        expect(item.prepS).toBeGreaterThanOrEqual(PREP_S[item.level][item.action]);
        expect(scheduleContains(4, "beginner", item.id)).toBe(true);
      }
      const visible = segments.flatMap((segment) => obstaclesForTile(course.obstacles, segment.spawn, distance, tileSize));
      expect(visible.length, `t=${second} spawn=${nextSpawn}`).toBeGreaterThan(0);
    }
    expect(nextSpawn).toBeGreaterThan(segmentCount + 10);
  });
});
