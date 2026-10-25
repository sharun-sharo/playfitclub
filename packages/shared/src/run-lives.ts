import type { CourseLevel } from "./obstacle-schedule";

/**
 * FitRunner V2 lives.
 * The phone and TV detect an overlap on the local course. This module does not
 * simulate that course or the jump arc. It only decides whether one obstacle
 * id spends one of the five lives. The obstacle id itself comes from the
 * server-owned schedule.
 */

export const RUN_LIVES = 5;

/** Same window as the local course invulnerability, in milliseconds. */
export const HIT_INVULNERABILITY_MS = 1150;

export type RunLives = {
  active: boolean;
  over: boolean;
  lives: number;
  hits: number;
  obstacleIds: string[];
  invulnerableUntil: number;
  /** Seed for the shared obstacle schedule. Null until the server starts the run. */
  courseSeed: number | null;
  /** Profile ceiling. The run still starts at beginner and steps up from there. */
  courseCeiling: CourseLevel;
};

export type HitRejectCode = "NOT_RUNNING" | "GAME_OVER" | "DUPLICATE_HIT" | "INVULNERABLE";

export type HitDecision =
  | { accepted: true; gameOver: boolean; run: RunLives }
  | { accepted: false; code: HitRejectCode; run: RunLives };

export function emptyRun(): RunLives {
  return {
    active: false,
    over: false,
    lives: RUN_LIVES,
    hits: 0,
    obstacleIds: [],
    invulnerableUntil: 0,
    courseSeed: null,
    courseCeiling: "beginner",
  };
}

/** A new run starts at 5. An active run that still has lives stays as it is. */
export function beginRun(run: RunLives): { run: RunLives; resumed: boolean } {
  if (run.active && !run.over && run.lives > 0) return { run, resumed: true };
  return { resumed: false, run: { ...emptyRun(), active: true } };
}

export function applyObstacleHit(run: RunLives, obstacleId: string, now: number, invulnerabilityMs: number): HitDecision {
  if (!run.active) return { accepted: false, code: "NOT_RUNNING", run };
  if (run.over || run.lives <= 0) return { accepted: false, code: "GAME_OVER", run };
  if (run.obstacleIds.includes(obstacleId)) return { accepted: false, code: "DUPLICATE_HIT", run };
  if (now < run.invulnerableUntil) return { accepted: false, code: "INVULNERABLE", run };
  const lives = run.lives - 1;
  const next: RunLives = {
    active: true,
    over: lives <= 0,
    lives,
    hits: run.hits + 1,
    obstacleIds: [...run.obstacleIds, obstacleId],
    invulnerableUntil: now + invulnerabilityMs,
    courseSeed: run.courseSeed,
    courseCeiling: run.courseCeiling,
  };
  return { accepted: true, gameOver: next.over, run: next };
}
