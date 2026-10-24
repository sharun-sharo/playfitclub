/**
 * Clearance grades for FitRunner V2.
 *
 * Measured from the live prototype tuning, not a random timer:
 * - Obstacles every obstacleEvery(3) * tileSize(3) = 9 m.
 * - forwardSpeed 6.15 m/s → 1463 ms between obstacles. maxSpeed 8.2 m/s → 1098 ms.
 * - Lane slide laneChangeDuration = 250 ms.
 * - Lane crate depth props.blocker.z = 1.18 m → 192 ms at 6.15 m/s, 144 ms at 8.2 m/s.
 * - Hurdle depth props.log.z = 0.16 m → 26 ms at 6.15 m/s.
 * - Roll-gate depth props.fence.z = 0.18 m → 29 ms at 6.15 m/s.
 *
 * The press is graded by time-to-contact = distanceMeters / speedMps.
 * At 6.15 m/s the windows are:
 * - PERFECT 113–442 ms (about half a lane slide through one slide plus the crate depth)
 * - GREAT 26–642 ms
 * - GOOD 0–732 ms (half of the 1463 ms gap, so a press at first sight is a miss)
 */

export const COMBO_MEASUREMENT = {
  obstacleSpacingM: 9,
  startSpeedMps: 6.15,
  maxSpeedMps: 8.2,
  laneSlideMs: 250,
  crateDepthM: 1.18,
  hurdleDepthM: 0.16,
  gateDepthM: 0.18,
} as const;

export const COMBO_CONFIG = {
  chainThresholds: [1, 3, 5, 8, 12] as const,
  baseClearancePoints: 10,
  /** Added once per successful clear. Distance and token points are not multiplied. */
  bonusByGrade: { PERFECT: 15, GREAT: 10, GOOD: 5, MISS: 0 } as const,
  maxMultiplier: 5,
} as const;

export type GradeName = "PERFECT" | "GREAT" | "GOOD" | "MISS";
export type ActionKind = "jump" | "roll" | "lane";
export type InputSource = "keyboard" | "camera";
export type ObstacleKindName = "rock" | "log" | "fence";

export type ClearanceWindow = { min: number; max: number };

export function clearanceWindowsMs(speedMps: number): { perfect: ClearanceWindow; great: ClearanceWindow; good: ClearanceWindow } {
  const speed = Math.min(COMBO_MEASUREMENT.maxSpeedMps, Math.max(0.5, speedMps));
  const crateMs = (COMBO_MEASUREMENT.crateDepthM / speed) * 1000;
  const barMs = (COMBO_MEASUREMENT.hurdleDepthM / speed) * 1000;
  const gapMs = (COMBO_MEASUREMENT.obstacleSpacingM / speed) * 1000;
  const slide = COMBO_MEASUREMENT.laneSlideMs;
  return {
    perfect: { min: Math.round(slide * 0.45), max: Math.round(slide + crateMs) },
    great: { min: Math.round(barMs), max: Math.round(slide * 1.8 + crateMs) },
    good: { min: 0, max: Math.round(Math.min(780, gapMs * 0.5)) },
  };
}

export function expectedAction(kind: ObstacleKindName): ActionKind {
  if (kind === "log") return "jump";
  if (kind === "fence") return "roll";
  return "lane";
}

function inside(window: ClearanceWindow, timeMs: number) {
  return timeMs >= window.min && timeMs <= window.max;
}

export function gradeClearance(input: {
  correct: boolean;
  hit: boolean;
  timeToContactMs: number | null;
  speedMps: number;
}): GradeName {
  if (input.hit || !input.correct || input.timeToContactMs === null || !Number.isFinite(input.timeToContactMs)) return "MISS";
  const windows = clearanceWindowsMs(input.speedMps);
  if (inside(windows.perfect, input.timeToContactMs)) return "PERFECT";
  if (inside(windows.great, input.timeToContactMs)) return "GREAT";
  if (inside(windows.good, input.timeToContactMs)) return "GOOD";
  return "MISS";
}

/** 1, 3, 5, 8, 12 successful clears map to x1–x5. */
export function multiplierForChain(successfulClears: number): number {
  let multiplier = 0;
  COMBO_CONFIG.chainThresholds.forEach((step, index) => {
    if (successfulClears >= step) multiplier = index + 1;
  });
  return Math.min(COMBO_CONFIG.maxMultiplier, multiplier);
}

export function clearanceAward(grade: GradeName, multiplier: number, geometricClear: boolean): { base: number; bonus: number } {
  const base = geometricClear ? COMBO_CONFIG.baseClearancePoints : 0;
  const bonus = grade === "MISS" ? 0 : COMBO_CONFIG.bonusByGrade[grade] * Math.max(1, multiplier);
  return { base, bonus };
}

export function composeScore(input: { distanceM: number; tokens: number; awards: Array<{ base: number; bonus: number }> }): number {
  const clearance = input.awards.reduce((sum, award) => sum + award.base + award.bonus, 0);
  return Math.floor(input.distanceM * 1 + input.tokens * 25 + clearance);
}

export type GradePopup = {
  grade: GradeName;
  source: InputSource;
  multiplier: number;
  bestMultiplier: number;
  chain: number;
  label: string;
};

export function gradeLabel(grade: GradeName, source: InputSource): string {
  if (source === "keyboard") return `${grade} · keyboard`;
  return grade;
}

type Arm = {
  action: ActionKind;
  source: InputSource;
  speedMps: number;
  distanceToObstacleM: number;
  at: number;
};

function pressError(arm: Arm) {
  const windows = clearanceWindowsMs(arm.speedMps);
  const mid = (windows.perfect.min + windows.perfect.max) / 2;
  const timeMs = (arm.distanceToObstacleM / Math.max(arm.speedMps, 0.5)) * 1000;
  return Math.abs(timeMs - mid);
}

export class ComboChain {
  chain = 0;
  bestChain = 0;
  cameraChain = 0;
  bestCameraChain = 0;
  perfects = 0;
  cameraPerfects = 0;
  points = 0;
  private armed = new Map<string, Arm>();
  private seen = new Set<string>();
  private awards: Array<{ base: number; bonus: number }> = [];

  /** A camera confidence dip is not a miss and does not reset the chain. */
  ignoreConfidenceDip() {
    return this.chain;
  }

  arm(input: { obstacleId: string; action: ActionKind; expected: ActionKind; source: InputSource; speedMps: number; distanceToObstacleM: number }) {
    const next: Arm = {
      action: input.action,
      source: input.source,
      speedMps: input.speedMps,
      distanceToObstacleM: input.distanceToObstacleM,
      at: input.distanceToObstacleM,
    };
    const current = this.armed.get(input.obstacleId);
    if (!current) {
      this.armed.set(input.obstacleId, next);
      return;
    }
    const nextCorrect = next.action === input.expected;
    const currentCorrect = current.action === input.expected;
    if (currentCorrect && !nextCorrect) return;
    if (nextCorrect && !currentCorrect) {
      this.armed.set(input.obstacleId, next);
      return;
    }
    if (pressError(next) < pressError(current)) this.armed.set(input.obstacleId, next);
  }

  resolve(input: { obstacleId: string; kind: ObstacleKindName; outcome: "clear" | "hit"; threatened: boolean }): {
    grade: GradeName;
    source: InputSource;
    award: { base: number; bonus: number };
    chain: number;
    multiplier: number;
  } | null {
    if (this.seen.has(input.obstacleId)) return null;
    const arm = this.armed.get(input.obstacleId) ?? null;
    this.armed.delete(input.obstacleId);
    const hit = input.outcome === "hit";
    if (!hit && !input.threatened && !arm) return null;
    this.seen.add(input.obstacleId);
    const expected = expectedAction(input.kind);
    const correct = !!arm && arm.action === expected;
    const speed = arm?.speedMps ?? COMBO_MEASUREMENT.startSpeedMps;
    const timeToContactMs = arm ? (arm.distanceToObstacleM / Math.max(speed, 0.5)) * 1000 : null;
    const grade = gradeClearance({ correct, hit, timeToContactMs, speedMps: speed });
    const success = grade !== "MISS";
    if (success) {
      this.chain += 1;
      this.bestChain = Math.max(this.bestChain, this.chain);
      if (arm?.source === "camera") {
        this.cameraChain += 1;
        this.bestCameraChain = Math.max(this.bestCameraChain, this.cameraChain);
      }
      if (grade === "PERFECT") {
        this.perfects += 1;
        if (arm?.source === "camera") this.cameraPerfects += 1;
      }
    } else {
      this.chain = 0;
      this.cameraChain = 0;
    }
    const multiplier = multiplierForChain(this.chain);
    const award = clearanceAward(grade, multiplier, !hit);
    this.awards.push(award);
    this.points += award.base + award.bonus;
    return { grade, source: arm?.source ?? "keyboard", award, chain: this.chain, multiplier: multiplierForChain(this.chain) };
  }

  snapshot() {
    return {
      chain: this.chain,
      multiplier: multiplierForChain(this.chain),
      bestChain: this.bestChain,
      bestMultiplier: multiplierForChain(this.bestChain),
      cameraChain: this.cameraChain,
      cameraBestMultiplier: multiplierForChain(this.bestCameraChain),
      perfects: this.perfects,
      cameraPerfects: this.cameraPerfects,
      clearancePoints: this.points,
      awards: this.awards.slice(),
    };
  }
}
