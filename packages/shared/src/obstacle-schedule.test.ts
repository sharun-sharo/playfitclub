import { describe, expect, it } from "vitest";
import {
  AIRBORNE_S,
  BODY_DEPTH_M,
  CLEARANCE_MARGIN_M,
  COURSE_SPEED,
  LATENCY_BUDGET_S,
  PAIR_FLOOR_S,
  PREP_S,
  STAND_RECOVERY_S,
  assessSchedule,
  courseCeilingFromProfile,
  courseDebugSnapshot,
  courseLevelAt,
  latencyAllowanceS,
  distanceAt,
  scheduleContains,
  courseHorizonFor,
  scheduleCourse,
  speedAt,
  upcomingCue,
  type CourseLevel,
  type ScheduledObstacle,
} from "./obstacle-schedule";

function pairGaps(obstacles: ScheduledObstacle[], previous: "jump" | "squat" | "lane", next: "jump" | "squat" | "lane") {
  const path = assessSchedule(obstacles).path;
  const gaps: number[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const before = path[index - 1];
    const after = path[index];
    if (before?.action === previous && after?.action === next) gaps.push(after.gapS);
  }
  return gaps;
}

function courseAt(speed: number, ceiling: CourseLevel = "advanced") {
  return scheduleCourse({
    seed: 11,
    ceiling,
    untilTimeS: 160,
    speed: { start: speed, gain: 0, max: speed },
  });
}

describe("fitrunner obstacle schedule", () => {
  it("keeps jump, squat, and lane pairs far enough apart at both course speeds", () => {
    for (const speed of [6.15, 8.2]) {
      const course = courseAt(speed);
      expect(course.valid, course.reasons.join(",")).toBe(true);
      expect(pairGaps(course.obstacles, "jump", "squat").length).toBeGreaterThan(0);
      expect(pairGaps(course.obstacles, "squat", "jump").length).toBeGreaterThan(0);
      expect(pairGaps(course.obstacles, "lane", "lane").length).toBeGreaterThan(0);
      expect(pairGaps(course.obstacles, "lane", "jump").length).toBeGreaterThan(0);
      expect(pairGaps(course.obstacles, "jump", "lane").length).toBeGreaterThan(0);
      for (const gap of pairGaps(course.obstacles, "jump", "squat")) expect(gap).toBeGreaterThanOrEqual(3);
      for (const gap of pairGaps(course.obstacles, "squat", "jump")) expect(gap).toBeGreaterThanOrEqual(3);
      for (const gap of pairGaps(course.obstacles, "lane", "lane")) expect(gap).toBeGreaterThanOrEqual(PAIR_FLOOR_S.lane.lane);
      for (const gap of pairGaps(course.obstacles, "lane", "jump")) expect(gap).toBeGreaterThanOrEqual(2);
      for (const gap of pairGaps(course.obstacles, "jump", "lane")) expect(gap).toBeGreaterThanOrEqual(PAIR_FLOOR_S.jump.lane);
      const lanes = new Set(course.obstacles.map((item) => item.lane));
      expect(lanes.size).toBeGreaterThan(1);
    }
  });

  it("includes the latency budget inside the prep and leaves a path for a late reaction", () => {
    const course = scheduleCourse({ seed: 4, ceiling: "beginner", untilTimeS: 90 });
    expect(course.valid).toBe(true);
    for (const item of course.obstacles) {
      expect(item.prepS).toBeGreaterThanOrEqual(latencyAllowanceS(item.action));
      expect(latencyAllowanceS(item.action)).toBeLessThan(LATENCY_BUDGET_S.commandStale);
      expect(item.prepS).toBeGreaterThanOrEqual(PREP_S[item.level][item.action]);
    }
    const path = assessSchedule(course.obstacles).path;
    for (let index = 1; index < path.length; index += 1) {
      const before = path[index - 1];
      const after = path[index];
      if (!before?.action || !after?.action) continue;
      const afterLateStart = before.windowCloseS;
      expect(after.windowOpenS - afterLateStart).toBeGreaterThanOrEqual(PAIR_FLOOR_S[before.action][after.action] - 1e-6);
    }
    expect(AIRBORNE_S + STAND_RECOVERY_S).toBeLessThanOrEqual(3);
    expect(BODY_DEPTH_M).toBe(0.7);
    expect(CLEARANCE_MARGIN_M).toBe(0.45);
  });

  it("rejects a beat that blocks every lane and a jump that is immediately followed by a squat", () => {
    const blocked = assessSchedule([
      sample({ id: "obs:0", index: 0, kind: "rock", lane: -1, action: "lane" }),
      sample({ id: "obs:1", index: 1, kind: "rock", lane: 0, action: "lane" }),
      sample({ id: "obs:2", index: 2, kind: "rock", lane: 1, action: "lane" }),
    ]);
    expect(blocked.ok).toBe(false);
    expect(blocked.reasons).toContain("all-lanes-blocked");
    expect(blocked.path).toHaveLength(0);

    const tight = assessSchedule([
      sample({ id: "obs:0", index: 0, kind: "log", lane: 0, action: "jump", windowOpenS: 2, windowCloseS: 2.2, contactS: 2.3, prepS: 2, gapFromPreviousS: 2 }),
      sample({ id: "obs:1", index: 1, kind: "fence", lane: 0, action: "squat", windowOpenS: 2.4, windowCloseS: 2.6, contactS: 2.7, prepS: 2.5, gapFromPreviousS: 0.2 }),
    ]);
    expect(tight.ok).toBe(false);
    expect(tight.reasons).toContain("jump-then-squat");

    const reverse = assessSchedule([
      sample({ id: "obs:0", index: 0, kind: "fence", lane: 0, action: "squat", windowOpenS: 2.5, windowCloseS: 2.7, contactS: 2.8, prepS: 2.5, gapFromPreviousS: 2.5 }),
      sample({ id: "obs:1", index: 1, kind: "log", lane: 0, action: "jump", windowOpenS: 3.1, windowCloseS: 3.3, contactS: 3.4, prepS: 2, gapFromPreviousS: 0.4 }),
    ]);
    expect(reverse.ok).toBe(false);
    expect(reverse.reasons).toContain("squat-then-jump");

    const rapidLanes = assessSchedule([
      sample({ id: "obs:0", index: 0, kind: "rock", lane: 0, action: "lane", windowOpenS: 2, windowCloseS: 2.3, contactS: 2.45, prepS: 2, gapFromPreviousS: 2 }),
      sample({ id: "obs:1", index: 1, kind: "rock", lane: -1, action: "lane", windowOpenS: 2.5, windowCloseS: 2.8, contactS: 2.95, prepS: 1.5, gapFromPreviousS: 0.2 }),
    ]);
    expect(rapidLanes.ok).toBe(false);
    expect(rapidLanes.reasons).toContain("lane-then-lane");

    const laneJump = assessSchedule([
      sample({ id: "obs:0", index: 0, kind: "rock", lane: 0, action: "lane", windowOpenS: 2, windowCloseS: 2.3, contactS: 2.45, prepS: 2, gapFromPreviousS: 2 }),
      sample({ id: "obs:1", index: 1, kind: "log", lane: -1, action: "jump", windowOpenS: 3.2, windowCloseS: 3.4, contactS: 3.5, prepS: 2, gapFromPreviousS: 0.9 }),
    ]);
    expect(laneJump.ok).toBe(false);
    expect(laneJump.reasons).toContain("lane-then-jump");
  });

  it("gives every accepted sequence one route, and keeps the old 9 m gap behind", () => {
    for (const seed of [1, 2, 7, 11, 42]) {
      for (const ceiling of ["beginner", "intermediate", "advanced"] as const) {
        const course = scheduleCourse({ seed, ceiling, untilTimeS: 150 });
        const assessment = assessSchedule(course.obstacles);
        expect(assessment.ok, `${seed} ${ceiling} ${assessment.reasons.join(",")}`).toBe(true);
        expect(assessment.path.length).toBeGreaterThan(0);
        expect(course.obstacles.some((item) => item.lane !== 0)).toBe(true);
      }
    }
    const slow = courseAt(6.15);
    const fast = courseAt(8.2);
    const slowJumpSquat = leadingGap(slow.obstacles, "jump", "squat");
    const fastJumpSquat = leadingGap(fast.obstacles, "jump", "squat");
    expect(slowJumpSquat).toBeGreaterThan(9);
    expect(fastJumpSquat).toBeGreaterThan(slowJumpSquat);
    expect(speedAt(0)).toBe(6.15);
    expect(speedAt(120)).toBe(8.2);
    expect(COURSE_SPEED.gain).toBe(0.045);
  });

  it("starts a new player on beginner and only later shortens gaps that still meet the floors", () => {
    expect(courseCeilingFromProfile(null)).toBe("beginner");
    expect(courseCeilingFromProfile("easy")).toBe("beginner");
    expect(courseCeilingFromProfile("steady")).toBe("intermediate");
    expect(courseCeilingFromProfile("hard")).toBe("advanced");
    const fresh = scheduleCourse({ seed: 3, ceiling: "advanced", untilTimeS: 20 });
    expect(fresh.obstacles[0]?.level).toBe("beginner");
    expect(fresh.obstacles[0]?.prepS).toBe(PREP_S.beginner.jump);
    expect(courseLevelAt(0, "advanced")).toBe("beginner");
    expect(courseLevelAt(90, "beginner")).toBe("intermediate");
    expect(courseLevelAt(200, "beginner")).toBe("intermediate");
    const later = scheduleCourse({ seed: 3, ceiling: "advanced", untilTimeS: 140 });
    const walked = assessSchedule(later.obstacles).path;
    const advancedLanes: number[] = [];
    for (let index = 1; index < walked.length; index += 1) {
      const before = walked[index - 1];
      const after = walked[index];
      if (before?.action === "lane" && after?.action === "lane" && after.level === "advanced") advancedLanes.push(after.gapS);
    }
    expect(advancedLanes.length).toBeGreaterThan(0);
    for (const gap of advancedLanes) expect(gap).toBeGreaterThanOrEqual(1.5);
    expect(Math.min(...advancedLanes)).toBeLessThan(2);
    const server = scheduleCourse({ seed: 99, ceiling: "intermediate", untilTimeS: 80 });
    const beginner = scheduleCourse({ seed: 99, ceiling: "beginner", untilTimeS: 80 });
    expect(scheduleContains(99, "intermediate", server.obstacles[3]?.id ?? "")).toBe(true);
    expect(scheduleContains(99, "intermediate", "not-real")).toBe(false);
    expect(server.obstacles.map((item) => `${item.kind}:${item.lane}:${item.distanceM.toFixed(2)}`).join("|")).not.toBe(
      beginner.obstacles.map((item) => `${item.kind}:${item.lane}:${item.distanceM.toFixed(2)}`).join("|"),
    );
  });

  it("warns from the real upcoming obstacle and keeps the debug snapshot free of secrets", () => {
    const course = scheduleCourse({ seed: 5, ceiling: "beginner", untilTimeS: 30 });
    const first = course.obstacles[0];
    if (!first) throw new Error("missing obstacle");
    const early = upcomingCue(course.obstacles, 0, 0);
    expect(early?.id).toBe(first.id);
    expect(early?.label).toBe("JUMP · CENTER");
    expect(early?.secondsUntilWindow).toBeCloseTo(first.windowOpenS, 5);
    const gone = upcomingCue(course.obstacles, first.contactS + 0.05, 0);
    expect(gone?.id).not.toBe(first.id);
    const debug = courseDebugSnapshot({
      obstacles: course.obstacles,
      elapsedS: 0.4,
      speedMps: 6.15,
      playerLane: 0,
      valid: true,
      reasons: [],
    });
    expect(debug.validation).toBe("ok");
    expect(debug.requiredAction).toContain("JUMP");
    expect(debug.difficulty).toBe("beginner");
    expect(debug.latencyAllowanceS).toBeGreaterThan(0);
    expect(debug.recoveryAllowanceS).toBeCloseTo(AIRBORNE_S + STAND_RECOVERY_S, 5);
    expect(JSON.stringify(debug)).not.toMatch(/token|secret|password|session/i);
  });

  it("keeps a valid obstacle ahead after 45 seconds and those ids on the server schedule", () => {
    expect(distanceAt(45)).toBeGreaterThan(300);
    expect(distanceAt(60)).toBeGreaterThan(400);
    const course = scheduleCourse({ seed: 11, ceiling: "beginner" });
    expect(course.valid, course.reasons.join(",")).toBe(true);
    expect(course.obstacles.at(-1)?.contactS ?? 0).toBeGreaterThan(90);
    for (const second of [0, 45, 60, 90]) {
      const distance = distanceAt(second);
      const ahead = course.obstacles.filter((item) => item.distanceM > distance + 1 && item.distanceM < distance + 50);
      expect(ahead.length, `t=${second} d=${distance.toFixed(0)}`).toBeGreaterThan(0);
      for (const item of ahead) {
        expect(item.prepS).toBeGreaterThanOrEqual(PREP_S[item.level][item.action]);
        expect(item.windowOpenS).toBeLessThan(item.contactS);
        expect(scheduleContains(11, "beginner", item.id)).toBe(true);
      }
    }
    const horizon = courseHorizonFor(distanceAt(45));
    const extended = scheduleCourse({ seed: 11, ceiling: "beginner", untilDistanceM: horizon });
    const at45 = distanceAt(45);
    expect(extended.obstacles.some((item) => item.distanceM > at45 + 1 && item.distanceM < at45 + 50)).toBe(true);
    expect(scheduleContains(11, "beginner", "palm")).toBe(false);
    expect(scheduleContains(11, "beginner", "not-an-obstacle")).toBe(false);
  });
});

function sample(overrides: Partial<ScheduledObstacle> & Pick<ScheduledObstacle, "id" | "index" | "kind" | "lane" | "action">): ScheduledObstacle {
  return {
    distanceM: 20,
    depthM: 0.16,
    windowOpenS: 2.5,
    windowCloseS: 2.7,
    contactS: 2.8,
    prepS: 2.5,
    gapFromPreviousS: 2.5,
    level: "beginner",
    ...overrides,
  };
}

function leadingGap(obstacles: ScheduledObstacle[], previous: "jump" | "squat" | "lane", next: "jump" | "squat" | "lane") {
  const ordered = [...obstacles].sort((a, b) => a.contactS - b.contactS || a.index - b.index);
  for (let index = 1; index < ordered.length; index += 1) {
    const before = ordered[index - 1];
    const after = ordered[index];
    if (!before || !after) continue;
    if (before.action === previous && after.action === next && after.contactS > before.contactS + 0.05) {
      return after.distanceM - before.distanceM;
    }
  }
  return 0;
}
