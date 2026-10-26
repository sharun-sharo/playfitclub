/**
 * FitRunner obstacle schedule.
 *
 * The server owns this sequence: kind, lane, and when. The TV places meshes
 * from the same pure function and the same seed. It does not roll its own
 * obstacles. Overlap is still detected on the TV. This module does not
 * simulate the jump arc. The arc stays on the client (takeoff 5.6 m/s,
 * gravity 18 m/s²).
 *
 * Spacing is time between action windows, not a fixed tile step. The old
 * course put an obstacle every 9 m, which is about 1.46 s at 6.15 m/s.
 */

export type CourseLevel = "beginner" | "intermediate" | "advanced";
export type ScheduledAction = "jump" | "squat" | "lane";
export type ScheduledKind = "log" | "fence" | "rock";
export type CourseLane = -1 | 0 | 1;

export type CourseSpeed = { start: number; gain: number; max: number };

/** Same band as the live course. Difficulty does not cut this. */
export const COURSE_SPEED: CourseSpeed = { start: 6.15, gain: 0.045, max: 8.2 };

/** Airborne skinned body plus the landing margin from the jump arc. */
export const BODY_DEPTH_M = 0.7;
export const CLEARANCE_MARGIN_M = 0.45;

/** Hit depths. These match the course meshes and are not shrunk. */
export const OBSTACLE_DEPTH_M: Record<ScheduledKind, number> = {
  log: 0.16,
  fence: 0.18,
  rock: 1.18,
};

export const CARGO_HIT_M = { x: 2.2, y: 2.78, z: 1.18 } as const;

/** Algebra from the client arc. Not a simulated trajectory. */
export const JUMP_TAKEOFF_MPS = 5.6;
export const JUMP_GRAVITY_MPS2 = 18;
export const JUMP_BAR_M = 0.4;
export const AIRBORNE_S = (2 * JUMP_TAKEOFF_MPS) / JUMP_GRAVITY_MPS2;

/**
 * Standing recovery after a jump lands or a squat releases.
 * DEFAULT_THRESHOLDS.recoverMs in the motion machine is 180.
 * The spawner waits. Player input is not disabled.
 */
export const STAND_RECOVERY_S = 0.18;

/** Matches fitRunnerTuning.laneChangeDuration. Ease-out, already in the lane at the end. */
export const LANE_SLIDE_S = 0.1;

/**
 * Detector budgets measured from the motion tests, not from a phone:
 * - A clear jump emits on the rise frame (0 ms) or the next frame (33 ms). Budget the next frame.
 * - A squat emits within 66 ms of the down pose.
 * - A lane emits on the frame after the hand is past the line (33 ms).
 * Commands older than 800 ms are dropped (COMMAND_STALE_MS).
 * 400 ms was shorter than the 622 ms jump arc, so a squat or jump
 * that arrived while the runner was still in the air was deleted.
 *
 * socketHopS is not a measured phone round trip. The server relays one
 * movement event from the phone to the TV. 150 ms is the allowance for
 * that hop when a live round trip was not measured.
 * renderFrameS is one painted frame at 60 Hz.
 */
export const LATENCY_BUDGET_S = {
  detectorJump: 0.033,
  detectorSquat: 0.066,
  detectorLane: 0.033,
  socketHop: 0.15,
  renderFrame: 1 / 60,
  commandStale: 0.8,
} as const;

/** Human preparation before the action window. The latency budget fits inside these. */
export const PREP_S: Record<CourseLevel, Record<ScheduledAction, number>> = {
  beginner: { jump: 2.5, squat: 3, lane: 2 },
  intermediate: { jump: 2.25, squat: 2.75, lane: 1.75 },
  advanced: { jump: 2, squat: 2.5, lane: 1.5 },
};

/**
 * Floors between required actions. A level may wait longer. It never waits less.
 * Lane then lane is at least the human lane prep, which is far longer than the 100 ms slide,
 * so two arm raises are not required inside one slide.
 */
export const PAIR_FLOOR_S: Record<ScheduledAction, Record<ScheduledAction, number>> = {
  jump: { jump: 2, squat: 3, lane: 1.5 },
  squat: { jump: 3, squat: 2.5, lane: 1.5 },
  lane: { jump: 2, squat: 2.5, lane: 1.5 },
};

/** Seconds after which a run may step up. A new player (beginner ceiling) never reaches advanced. */
export const LEVEL_RAMP_S: Record<CourseLevel, { intermediate: number; advanced: number }> = {
  beginner: { intermediate: 70, advanced: Number.POSITIVE_INFINITY },
  intermediate: { intermediate: 40, advanced: Number.POSITIVE_INFINITY },
  advanced: { intermediate: 30, advanced: 80 },
};

const SCRIPT: ScheduledAction[] = ["jump", "squat", "jump", "lane", "lane", "jump", "squat", "lane"];

export type ScheduledObstacle = {
  id: string;
  index: number;
  kind: ScheduledKind;
  lane: CourseLane;
  action: ScheduledAction;
  /** Meters from the start to the leading face. */
  distanceM: number;
  depthM: number;
  /** Earliest moment the player can begin this action and still clear. */
  windowOpenS: number;
  /** Latest moment the player can begin this action and still clear. */
  windowCloseS: number;
  /** When the body origin meets the leading face. */
  contactS: number;
  prepS: number;
  /** Time from the previous required action's window close. The first one is its prep. */
  gapFromPreviousS: number;
  level: CourseLevel;
};

export type CourseSchedule = {
  seed: number;
  ceiling: CourseLevel;
  obstacles: ScheduledObstacle[];
  valid: boolean;
  reasons: string[];
};

export type ScheduleAssessment = {
  ok: boolean;
  reasons: string[];
  /** One achievable route. Empty when every path is blocked. */
  path: Array<{
    action: ScheduledAction | null;
    lane: CourseLane;
    windowOpenS: number;
    windowCloseS: number;
    gapS: number;
    level: CourseLevel;
  }>;
};

const LANES: CourseLane[] = [-1, 0, 1];

/**
 * A schedule with no distance, time, or count limit.
 * Ten minutes is past the old 220 m stop, which emptied the road near 45 s.
 */
export const DEFAULT_COURSE_S = 600;

/** First local chunk. Longer than 45 s, then the runner keeps a buffer ahead. */
export const COURSE_CHUNK_S = 150;

/** Meters the local course keeps filled ahead of the runner. */
export function courseHorizonFor(distanceM: number) {
  const ran = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
  return Math.max(distanceAt(COURSE_CHUNK_S), ran + 160);
}

export function courseCeilingFromProfile(value: unknown): CourseLevel {
  if (value === "hard" || value === "advanced") return "advanced";
  if (value === "steady" || value === "intermediate") return "intermediate";
  return "beginner";
}

export function courseLevelAt(elapsedS: number, ceiling: CourseLevel): CourseLevel {
  const ramp = LEVEL_RAMP_S[ceiling];
  const time = Math.max(0, elapsedS);
  if (time >= ramp.advanced) return "advanced";
  if (time >= ramp.intermediate) return "intermediate";
  return "beginner";
}

export function speedAt(elapsedS: number, speed: CourseSpeed = COURSE_SPEED) {
  return Math.min(speed.max, speed.start + speed.gain * Math.max(0, elapsedS));
}

export function distanceAt(elapsedS: number, speed: CourseSpeed = COURSE_SPEED) {
  const time = Math.max(0, elapsedS);
  const ramp = speed.gain <= 0 ? Number.POSITIVE_INFINITY : (speed.max - speed.start) / speed.gain;
  if (time <= ramp) return speed.start * time + 0.5 * speed.gain * time * time;
  const rampDistance = speed.start * ramp + 0.5 * speed.gain * ramp * ramp;
  return rampDistance + speed.max * (time - ramp);
}

export function clearanceMeters(kind: ScheduledKind) {
  return OBSTACLE_DEPTH_M[kind] + BODY_DEPTH_M + CLEARANCE_MARGIN_M;
}

/** Time to rise from the track to the hurdle bar. height = v t − ½ g t², smaller root. */
export function jumpRiseToBarS() {
  const disc = JUMP_TAKEOFF_MPS * JUMP_TAKEOFF_MPS - 2 * JUMP_GRAVITY_MPS2 * JUMP_BAR_M;
  return (JUMP_TAKEOFF_MPS - Math.sqrt(Math.max(0, disc))) / JUMP_GRAVITY_MPS2;
}

export function latencyAllowanceS(action: ScheduledAction) {
  const detector =
    action === "squat" ? LATENCY_BUDGET_S.detectorSquat : action === "lane" ? LATENCY_BUDGET_S.detectorLane : LATENCY_BUDGET_S.detectorJump;
  return detector + LATENCY_BUDGET_S.socketHop + LATENCY_BUDGET_S.renderFrame;
}

/** How long before the leading face the action must already have started so a late start still clears. */
export function commitLeadS(action: ScheduledAction) {
  if (action === "lane") return LANE_SLIDE_S + LATENCY_BUDGET_S.renderFrame;
  if (action === "jump") return jumpRiseToBarS() + LATENCY_BUDGET_S.renderFrame;
  return LATENCY_BUDGET_S.renderFrame;
}

export function recoveryFloorS(previous: ScheduledAction, next: ScheduledAction) {
  if (previous === "jump" && next === "squat") return AIRBORNE_S + STAND_RECOVERY_S;
  if (previous === "squat" && next === "jump") return STAND_RECOVERY_S;
  if (previous === "jump") return AIRBORNE_S;
  return 0;
}

export function gapNeeded(previous: ScheduledAction | null, next: ScheduledAction, level: CourseLevel) {
  const prep = PREP_S[level][next];
  if (!previous) return prep;
  return Math.max(prep, PAIR_FLOOR_S[previous][next], recoveryFloorS(previous, next));
}

/**
 * How early the HUD warning can appear, in seconds before the body meets the obstacle.
 * The good clearance grade uses this so a reaction during the warning still scores.
 */
export function warningHorizonS(speedMps: number) {
  const speed = Math.max(speedMps, COURSE_SPEED.start);
  const longestClearance = clearanceMeters("rock");
  const longestCommit = Math.max(commitLeadS("jump"), commitLeadS("squat"), commitLeadS("lane"));
  return PREP_S.beginner.squat + longestClearance / speed + longestCommit;
}

export function actionForKind(kind: ScheduledKind): ScheduledAction {
  if (kind === "log") return "jump";
  if (kind === "fence") return "squat";
  return "lane";
}

export function laneName(lane: CourseLane) {
  if (lane < 0) return "left";
  if (lane > 0) return "right";
  return "center";
}

type Occupant = { kind: ScheduledKind; lane: CourseLane };

function occupant(items: Occupant[], lane: CourseLane) {
  return items.find((item) => item.lane === lane);
}

/** One action. A rock lane is left for an empty lane. A hurdle or gate is handled in place. */
export function canonicalStep(lane: CourseLane, items: Occupant[]): { lane: CourseLane; action: ScheduledAction | null } | null {
  const here = occupant(items, lane);
  if (!here) return { lane, action: null };
  if (here.kind === "log") return { lane, action: "jump" };
  if (here.kind === "fence") return { lane, action: "squat" };
  const free = LANES.filter((candidate) => !occupant(items, candidate));
  if (!free.length) return null;
  const dest = free.slice().sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane) || a - b)[0];
  if (dest === undefined) return null;
  return { lane: dest, action: "lane" };
}

function groupBeats(obstacles: ScheduledObstacle[]) {
  const groups: ScheduledObstacle[][] = [];
  for (const item of obstacles) {
    const last = groups[groups.length - 1];
    const head = last?.[0];
    if (!head || Math.abs(head.contactS - item.contactS) > 0.02) groups.push([item]);
    else last.push(item);
  }
  return groups;
}

function pairReason(previous: ScheduledAction, next: ScheduledAction) {
  return `${previous}-then-${next}`;
}

export function assessSchedule(obstacles: ScheduledObstacle[]): ScheduleAssessment {
  const reasons: string[] = [];
  const path: ScheduleAssessment["path"] = [];
  let lane: CourseLane = 0;
  let lastAction: ScheduledAction | null = null;
  let lastClose = Number.NEGATIVE_INFINITY;

  for (const beat of groupBeats(obstacles)) {
    const head = beat[0];
    if (!head) continue;
    const rocks = new Set(beat.filter((item) => item.kind === "rock").map((item) => item.lane));
    if (rocks.size === 3) reasons.push("all-lanes-blocked");
    const actions = new Set(beat.map((item) => item.action));
    if (actions.size > 1) reasons.push("two-actions");
    const step = canonicalStep(lane, beat);
    if (!step) {
      reasons.push("no-path");
      break;
    }
    if (step.action) {
      const level = head.level;
      const need = gapNeeded(lastAction, step.action, level);
      const gap = lastAction ? head.windowOpenS - lastClose : head.windowOpenS;
      if (gap + 1e-4 < need) reasons.push(lastAction ? pairReason(lastAction, step.action) : "prep");
      if (lastAction && head.windowOpenS + 1e-4 < lastClose) reasons.push("overlap");
      if (head.prepS + 1e-4 < latencyAllowanceS(step.action)) reasons.push("latency");
      if (lastAction && gap + 1e-4 < recoveryFloorS(lastAction, step.action)) reasons.push("recovery");
      if (latencyAllowanceS(step.action) > LATENCY_BUDGET_S.commandStale) reasons.push("stale");
      path.push({
        action: step.action,
        lane: step.lane,
        windowOpenS: head.windowOpenS,
        windowCloseS: head.windowCloseS,
        gapS: gap,
        level,
      });
      lastAction = step.action;
      lastClose = head.windowCloseS;
    }
    lane = step.lane;
  }

  const unique = [...new Set(reasons)];
  return { ok: unique.length === 0 && path.length > 0, reasons: unique, path };
}

function mulberry32(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function specFor(action: ScheduledAction, lane: CourseLane, level: CourseLevel, random: () => number): Occupant[] {
  if (action === "jump" || action === "squat") {
    const kind: ScheduledKind = action === "jump" ? "log" : "fence";
    const lanes: CourseLane[] = [lane];
    if (level !== "beginner") {
      const others = LANES.filter((candidate) => candidate !== lane);
      const extra = others[Math.floor(random() * others.length)];
      if (extra !== undefined) lanes.push(extra);
    }
    return lanes.map((item) => ({ kind, lane: item }));
  }
  return [{ kind: "rock", lane }];
}

export function scheduleCourse(input: {
  seed: number;
  ceiling?: CourseLevel;
  untilDistanceM?: number;
  untilTimeS?: number;
  untilCount?: number;
  speed?: CourseSpeed;
}): CourseSchedule {
  const ceiling = input.ceiling ?? "beginner";
  const speed = input.speed ?? COURSE_SPEED;
  // A bare schedule used to stop at 220 m. That is about 31 s of contact at the
  // opening pace, and the road ahead of the runner is empty near 45 s.
  // Callers that pass a distance, a time, or a count keep that limit.
  // A caller that passes none of them still runs long enough for a full session.
  const untilDistance = input.untilDistanceM ?? Number.POSITIVE_INFINITY;
  const untilTime =
    input.untilTimeS ??
    (input.untilDistanceM !== undefined || input.untilCount !== undefined ? Number.POSITIVE_INFINITY : DEFAULT_COURSE_S);
  const untilCount = input.untilCount ?? Number.POSITIVE_INFINITY;
  const random = mulberry32(input.seed);
  const obstacles: ScheduledObstacle[] = [];
  let lane: CourseLane = 0;
  let lastAction: ScheduledAction | null = null;
  let lastClose = Number.NEGATIVE_INFINITY;
  let index = 0;

  for (let beat = 0; beat < 800 && obstacles.length < untilCount; beat += 1) {
    const level = courseLevelAt(Number.isFinite(lastClose) ? Math.max(0, lastClose) : 0, ceiling);
    const action = SCRIPT[beat % SCRIPT.length] ?? "jump";
    const placed = specFor(action, lane, level, random);
    const step = canonicalStep(lane, placed);
    if (!step?.action) break;
    const need = gapNeeded(lastAction, step.action, level);
    const windowOpenS = lastAction ? lastClose + need : need;
    const span = clearanceMeters(action === "jump" ? "log" : action === "squat" ? "fence" : "rock") / Math.max(0.5, speedAt(windowOpenS, speed));
    const windowCloseS = windowOpenS + span;
    const contactS = windowCloseS + commitLeadS(step.action);
    const distanceM = distanceAt(contactS, speed);
    if (contactS > untilTime || distanceM > untilDistance) break;
    const prepS = PREP_S[level][step.action];
    const gapFromPreviousS = lastAction ? windowOpenS - lastClose : windowOpenS;
    for (const item of placed) {
      obstacles.push({
        id: `obs:${index}`,
        index,
        kind: item.kind,
        lane: item.lane,
        action: actionForKind(item.kind),
        distanceM,
        depthM: OBSTACLE_DEPTH_M[item.kind],
        windowOpenS,
        windowCloseS,
        contactS,
        prepS,
        gapFromPreviousS,
        level,
      });
      index += 1;
    }
    lane = step.lane;
    lastAction = step.action;
    lastClose = windowCloseS;
  }

  const assessment = assessSchedule(obstacles);
  return { seed: input.seed >>> 0 || 1, ceiling, obstacles, valid: assessment.ok, reasons: assessment.reasons };
}

export function scheduleContains(seed: number, ceiling: CourseLevel, obstacleId: string) {
  const match = /^obs:(\d+)$/.exec(obstacleId);
  if (!match) return false;
  const index = Number(match[1]);
  if (!Number.isInteger(index) || index < 0 || index > 2000) return false;
  const course = scheduleCourse({ seed, ceiling, untilCount: index + 1 });
  return course.obstacles.some((item) => item.id === obstacleId);
}

export type ActionCue = {
  id: string;
  action: ScheduledAction;
  lane: CourseLane;
  label: string;
  secondsUntilWindow: number;
  prepS: number;
  level: CourseLevel;
};

export function upcomingCue(obstacles: ScheduledObstacle[], elapsedS: number, playerLane: CourseLane): ActionCue | null {
  for (const beat of groupBeats(obstacles)) {
    const head = beat[0];
    if (!head) continue;
    const showFrom = head.windowOpenS - head.prepS;
    if (elapsedS > head.contactS) continue;
    if (elapsedS < showFrom) break;
    const here = beat.find((item) => item.lane === playerLane);
    if (!here) continue;
    let label = `JUMP · ${laneName(here.lane).toUpperCase()}`;
    if (here.kind === "fence") label = `SQUAT · ${laneName(here.lane).toUpperCase()}`;
    if (here.kind === "rock") {
      const step = canonicalStep(playerLane, beat);
      label = step && step.lane < playerLane ? "MOVE LEFT" : "MOVE RIGHT";
    }
    return {
      id: here.id,
      action: here.action,
      lane: here.lane,
      label,
      secondsUntilWindow: Math.max(0, head.windowOpenS - elapsedS),
      prepS: head.prepS,
      level: head.level,
    };
  }
  return null;
}

export type CourseDebugSnapshot = {
  speedMps: number;
  secondsUntilNext: number | null;
  requiredAction: string;
  secondsBetweenActions: number | null;
  latencyAllowanceS: number;
  recoveryAllowanceS: number;
  difficulty: CourseLevel | "waiting";
  validation: string;
};

export function courseDebugSnapshot(input: {
  obstacles: ScheduledObstacle[];
  elapsedS: number;
  speedMps: number;
  playerLane: CourseLane;
  valid: boolean;
  reasons: string[];
}): CourseDebugSnapshot {
  const upcoming = input.obstacles.find((item) => item.contactS >= input.elapsedS && item.lane === input.playerLane);
  const cue = upcomingCue(input.obstacles, input.elapsedS, input.playerLane);
  return {
    speedMps: input.speedMps,
    secondsUntilNext: upcoming ? Math.max(0, upcoming.windowOpenS - input.elapsedS) : null,
    requiredAction: cue?.label ?? (upcoming ? upcoming.action : "none"),
    secondsBetweenActions: upcoming ? upcoming.gapFromPreviousS : null,
    latencyAllowanceS: latencyAllowanceS(upcoming?.action ?? "jump"),
    recoveryAllowanceS: AIRBORNE_S + STAND_RECOVERY_S,
    difficulty: upcoming?.level ?? "waiting",
    validation: input.valid ? "ok" : input.reasons.join(", ") || "rejected",
  };
}
