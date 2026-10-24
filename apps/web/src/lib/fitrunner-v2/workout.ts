import { DEFAULT_THRESHOLDS } from "@fitplay/game";
import { MOVEMENT_TYPES, type MovementType } from "@fitplay/shared";
import { estimateCalories, parseWeightKg } from "./calories";
import {
  clearanceAward,
  composeScore,
  expectedAction,
  gradeClearance,
  multiplierForChain,
  type ActionKind,
  type GradeName,
  type InputSource,
  type ObstacleKindName,
} from "./combo";
import { emptyDayFacts, type DayFacts } from "./missions";

/** Matches the pose engine's minActionConfidence. A dip under this is ignored. */
export const MIN_FITNESS_CONFIDENCE = DEFAULT_THRESHOLDS.minActionConfidence;

export const WORKOUT_RULES = {
  minActiveMs: 60_000,
  eligibleWorkoutXp: 40,
  maxSpeedMps: 8.2,
  maxEventsPerBatch: 80,
} as const;

const FITNESS_MOVES = new Set<MovementType>(["jump", "squat", "lean_left", "lean_right"]);
const REJECTED_KEYS = new Set([
  "xp",
  "calories",
  "calorie",
  "missionComplete",
  "missionsCompleted",
  "score",
  "finalScore",
  "awardedXp",
  "grade",
  "bonusScore",
]);

const CLIENT_RESULT_FIELDS = ["score", "xp", "calories", "missionComplete", "bonusScore"] as const;

/** A phone or TV client cannot post the score or the mission reward. The server calculates those. */
export function clientResultField(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;
  for (const key of CLIENT_RESULT_FIELDS) {
    if (key in record) return key;
  }
  return null;
}

export type WorkoutEventDraft = {
  eventId: string;
  kind: "movement" | "token" | "resolve";
  source: InputSource;
  movementType?: MovementType;
  confidence?: number;
  clientTimestamp: number;
  speedMps?: number;
  distanceM?: number;
  distanceToObstacleM?: number;
  obstacleKind?: ObstacleKindName;
  action?: ActionKind;
  outcome?: "clear" | "hit";
};

export type WorkoutSummary = {
  activeMs: number;
  cameraActiveMs: number;
  distanceM: number;
  score: number;
  tokens: number;
  jumps: number;
  squats: number;
  laneDodges: number;
  perfects: number;
  bestCombo: number;
  hits: number;
  calories: number | null;
  eligible: boolean;
  xp: number;
  cameraJumps: number;
  cameraSquats: number;
  cameraSquatClears: number;
  cameraLaneDodges: number;
  cameraPerfects: number;
  cameraBestCombo: number;
  cameraCleanMs: number;
  cameraTokens: number;
};

export function activeMilliseconds(startedAt: Date, endedAt: Date, pauses: Array<{ pausedAt: Date; resumedAt: Date | null }>): number {
  let paused = 0;
  for (const pause of pauses) {
    const end = pause.resumedAt ?? endedAt;
    if (end.getTime() > pause.pausedAt.getTime()) paused += end.getTime() - pause.pausedAt.getTime();
  }
  return Math.max(0, endedAt.getTime() - startedAt.getTime() - paused);
}

export function dedupeEvents<T extends { eventId: string }>(existingIds: Iterable<string>, incoming: T[]) {
  const seen = new Set(existingIds);
  const accepted: T[] = [];
  const ignored: string[] = [];
  for (const event of incoming) {
    if (seen.has(event.eventId)) {
      ignored.push(event.eventId);
      continue;
    }
    seen.add(event.eventId);
    accepted.push(event);
  }
  return { accepted, ignored };
}

function rejectedKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  for (const key of Object.keys(value)) {
    if (REJECTED_KEYS.has(key)) return key;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function optionalNumber(value: unknown, min: number, max: number): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return null;
  return value;
}

export function parseEventBatch(body: unknown): { ok: true; events: WorkoutEventDraft[] } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: "Events must be sent as an object." };
  const forbidden = rejectedKey(root);
  if (forbidden) return { ok: false, message: `Client ${forbidden} is not accepted.` };
  if (!Array.isArray(root.events)) return { ok: false, message: "Send an events array." };
  if (root.events.length > WORKOUT_RULES.maxEventsPerBatch) return { ok: false, message: "Too many events in one batch." };
  const events: WorkoutEventDraft[] = [];
  for (const item of root.events) {
    const forbiddenEvent = rejectedKey(item);
    if (forbiddenEvent) return { ok: false, message: `Client ${forbiddenEvent} is not accepted.` };
    const record = asRecord(item);
    if (!record) return { ok: false, message: "Each event must be an object." };
    if (typeof record.eventId !== "string" || record.eventId.length < 8 || record.eventId.length > 80) {
      return { ok: false, message: "Each event needs its own id." };
    }
    if (record.kind !== "movement" && record.kind !== "token" && record.kind !== "resolve") {
      return { ok: false, message: "Unknown event kind." };
    }
    if (record.source !== "keyboard" && record.source !== "camera") return { ok: false, message: "Event source must be keyboard or camera." };
    if (typeof record.clientTimestamp !== "number" || !Number.isFinite(record.clientTimestamp)) {
      return { ok: false, message: "Event time is invalid." };
    }
    const movementType = record.movementType;
    if (movementType !== undefined && (typeof movementType !== "string" || !MOVEMENT_TYPES.includes(movementType as MovementType))) {
      return { ok: false, message: "Unknown pose type." };
    }
    const confidence = optionalNumber(record.confidence, 0, 1);
    const speedMps = optionalNumber(record.speedMps, 0, 30);
    const distanceM = optionalNumber(record.distanceM, 0, 100_000);
    const distanceToObstacleM = optionalNumber(record.distanceToObstacleM, -2, 40);
    if (confidence === null || speedMps === null || distanceM === null || distanceToObstacleM === null) {
      return { ok: false, message: "Event measurements are invalid." };
    }
    if (record.source === "camera" && record.kind === "movement") {
      if (!movementType || confidence === undefined) return { ok: false, message: "Camera moves need a pose type and confidence." };
    }
    const obstacleKind = record.obstacleKind;
    if (obstacleKind !== undefined && obstacleKind !== "rock" && obstacleKind !== "log" && obstacleKind !== "fence") {
      return { ok: false, message: "Unknown obstacle." };
    }
    const action = record.action;
    if (action !== undefined && action !== "jump" && action !== "roll" && action !== "lane") {
      return { ok: false, message: "Unknown action." };
    }
    const outcome = record.outcome;
    if (outcome !== undefined && outcome !== "clear" && outcome !== "hit") return { ok: false, message: "Unknown outcome." };
    if (record.kind === "resolve" && (!obstacleKind || !outcome)) return { ok: false, message: "A clearance needs an obstacle and an outcome." };
    events.push({
      eventId: record.eventId,
      kind: record.kind,
      source: record.source,
      movementType: movementType as MovementType | undefined,
      confidence,
      clientTimestamp: record.clientTimestamp,
      speedMps,
      distanceM,
      distanceToObstacleM,
      obstacleKind,
      action,
      outcome,
    });
  }
  return { ok: true, events };
}

function isFitnessCameraMove(event: WorkoutEventDraft) {
  return (
    event.source === "camera" &&
    event.kind === "movement" &&
    !!event.movementType &&
    FITNESS_MOVES.has(event.movementType) &&
    (event.confidence ?? 0) >= MIN_FITNESS_CONFIDENCE
  );
}

function isCameraPresence(event: WorkoutEventDraft) {
  if (event.source !== "camera") return false;
  if (event.kind === "movement") return isFitnessCameraMove(event);
  return event.kind === "resolve";
}

export function cameraActivity(events: WorkoutEventDraft[], activeMs: number): { cameraActiveMs: number; cleanMs: number } {
  if (activeMs <= 0) return { cameraActiveMs: 0, cleanMs: 0 };
  const ordered = [...events].sort((a, b) => a.clientTimestamp - b.clientTimestamp || a.eventId.localeCompare(b.eventId));
  if (!ordered.some(isCameraPresence)) return { cameraActiveMs: 0, cleanMs: 0 };
  const keyboard = ordered.some((event) => event.source === "keyboard" && (event.kind === "movement" || event.kind === "resolve" || event.kind === "token"));
  if (!keyboard) return { cameraActiveMs: activeMs, cleanMs: cleanStretch(ordered, activeMs) };

  const start = ordered[0]?.clientTimestamp ?? 0;
  const end = ordered[ordered.length - 1]?.clientTimestamp ?? start;
  let mode: InputSource = "keyboard";
  let cursor = start;
  let cameraSpan = 0;
  let cleanRun = 0;
  let bestClean = 0;
  for (const event of ordered) {
    const delta = Math.max(0, event.clientTimestamp - cursor);
    if (mode === "camera") {
      cameraSpan += delta;
      cleanRun += delta;
    }
    if (event.kind === "resolve" && event.outcome === "hit") {
      bestClean = Math.max(bestClean, cleanRun);
      cleanRun = 0;
    }
    if (isCameraPresence(event)) mode = "camera";
    else if (event.source === "keyboard" && (event.kind === "movement" || event.kind === "resolve")) mode = "keyboard";
    cursor = event.clientTimestamp;
  }
  bestClean = Math.max(bestClean, mode === "camera" ? cleanRun : 0);
  const span = Math.max(1, end - start);
  const cameraActiveMs = Math.min(activeMs, Math.round((activeMs * cameraSpan) / span));
  const cleanMs = Math.min(cameraActiveMs, Math.round((activeMs * bestClean) / span));
  return { cameraActiveMs, cleanMs };
}

function cleanStretch(events: WorkoutEventDraft[], activeMs: number) {
  const hits = events.filter((event) => event.kind === "resolve" && event.outcome === "hit");
  if (hits.length === 0) return activeMs;
  const ordered = [...events].sort((a, b) => a.clientTimestamp - b.clientTimestamp);
  const start = ordered[0]?.clientTimestamp ?? 0;
  const end = ordered[ordered.length - 1]?.clientTimestamp ?? start;
  if (end <= start) return 0;
  const cuts = [start, ...hits.map((hit) => hit.clientTimestamp), end];
  let longest = 0;
  for (let index = 1; index < cuts.length; index += 1) longest = Math.max(longest, (cuts[index] ?? 0) - (cuts[index - 1] ?? 0));
  return Math.min(activeMs, Math.round((activeMs * longest) / (end - start)));
}

function clampDistance(reported: number, activeMs: number) {
  const cap = (Math.max(0, activeMs) / 1000) * WORKOUT_RULES.maxSpeedMps * 1.35 + 8;
  return Math.min(Math.max(0, reported), cap);
}

export function summarizeWorkout(input: { events: WorkoutEventDraft[]; activeMs: number; weightKg: number | null }): WorkoutSummary {
  const { accepted } = dedupeEvents([], input.events);
  const ordered = [...accepted].sort((a, b) => a.clientTimestamp - b.clientTimestamp || a.eventId.localeCompare(b.eventId));
  const reportedDistance = ordered.reduce((max, event) => Math.max(max, event.distanceM ?? 0), 0);
  const distanceM = clampDistance(reportedDistance, input.activeMs);
  const tokenCap = Math.floor(distanceM * 0.8) + 4;
  let tokens = 0;
  let cameraTokens = 0;
  let jumps = 0;
  let squats = 0;
  let laneDodges = 0;
  let perfects = 0;
  let hits = 0;
  let cameraJumps = 0;
  let cameraSquats = 0;
  let cameraSquatClears = 0;
  let cameraLaneDodges = 0;
  let cameraPerfects = 0;
  let cameraMoves = 0;
  let chain = 0;
  let bestChain = 0;
  let cameraChain = 0;
  let bestCameraChain = 0;
  const awards: Array<{ base: number; bonus: number }> = [];

  for (const event of ordered) {
    if (event.kind === "token") {
      if (event.source === "camera" && cameraTokens < tokenCap) cameraTokens += 1;
      if (tokens < tokenCap) tokens += 1;
    }
    if (event.kind === "movement") {
      const pose = event.movementType;
      if (pose === "jump" || event.action === "jump") jumps += 1;
      if (pose === "squat" || event.action === "roll") squats += 1;
      if (isFitnessCameraMove(event)) {
        cameraMoves += 1;
        if (pose === "jump") cameraJumps += 1;
        if (pose === "squat") cameraSquats += 1;
      }
    }
    if (event.kind !== "resolve" || !event.obstacleKind || !event.outcome) continue;
    const hit = event.outcome === "hit";
    const correct = !!event.action && event.action === expectedAction(event.obstacleKind);
    const speed = event.speedMps ?? 0.5;
    const timeToContactMs =
      event.distanceToObstacleM === undefined ? null : (event.distanceToObstacleM / Math.max(speed, 0.5)) * 1000;
    const grade: GradeName = gradeClearance({
      correct,
      hit,
      timeToContactMs,
      speedMps: speed,
    });
    const camera = event.source === "camera";
    if (grade !== "MISS") {
      chain += 1;
      bestChain = Math.max(bestChain, chain);
      if (camera) {
        cameraChain += 1;
        bestCameraChain = Math.max(bestCameraChain, cameraChain);
        if (event.action === "roll") cameraSquatClears += 1;
        if (event.action === "lane") {
          cameraLaneDodges += 1;
          laneDodges += 1;
        }
      } else if (event.action === "lane") laneDodges += 1;
      if (grade === "PERFECT") {
        perfects += 1;
        if (camera) cameraPerfects += 1;
      }
    } else {
      chain = 0;
      cameraChain = 0;
      if (hit) hits += 1;
    }
    const multiplier = multiplierForChain(chain);
    awards.push(clearanceAward(grade, multiplier, !hit));
  }

  const { cameraActiveMs, cleanMs } = cameraActivity(ordered, input.activeMs);
  const eligible = input.activeMs >= WORKOUT_RULES.minActiveMs && cameraMoves >= 1;
  return {
    activeMs: input.activeMs,
    cameraActiveMs,
    distanceM,
    score: composeScore({ distanceM, tokens, awards }),
    tokens,
    jumps,
    squats,
    laneDodges,
    perfects,
    bestCombo: multiplierForChain(bestChain),
    hits,
    calories: estimateCalories({ weightKg: input.weightKg, cameraActiveMs }),
    eligible,
    xp: eligible ? WORKOUT_RULES.eligibleWorkoutXp : 0,
    cameraJumps,
    cameraSquats,
    cameraSquatClears,
    cameraLaneDodges,
    cameraPerfects,
    cameraBestCombo: multiplierForChain(bestCameraChain),
    cameraCleanMs: cleanMs,
    cameraTokens,
  };
}

export function aggregateDay(parts: WorkoutSummary[]): DayFacts {
  const facts = emptyDayFacts();
  for (const part of parts) {
    facts.tokens += part.tokens;
    facts.cameraTokens += part.cameraTokens;
    facts.cameraSquatClears += part.cameraSquatClears;
    facts.cameraSquats += part.cameraSquats;
    facts.cameraActiveMs += part.cameraActiveMs;
    facts.longestCameraActiveMs = Math.max(facts.longestCameraActiveMs, part.cameraActiveMs);
    facts.cameraJumps += part.cameraJumps;
    facts.cameraLaneDodges += part.cameraLaneDodges;
    facts.cameraPerfects += part.cameraPerfects;
    if (part.eligible) facts.eligibleWorkouts += 1;
    facts.cameraBestCombo = Math.max(facts.cameraBestCombo, part.cameraBestCombo);
    facts.cameraCleanMs = Math.max(facts.cameraCleanMs, part.cameraCleanMs);
  }
  return facts;
}

export function eligibleTokenTotal(parts: Array<{ eligible: boolean; tokens: number }>) {
  return parts.reduce((sum, part) => sum + (part.eligible ? part.tokens : 0), 0);
}

export const ACHIEVEMENT_DEFS = [
  { key: "first_eligible_workout", title: "First eligible workout" },
  { key: "ten_perfects", title: "10 perfects in one workout" },
  { key: "combo_x5", title: "5x combo" },
  { key: "hundred_tokens", title: "100 tokens" },
  { key: "three_workout_days", title: "Eligible workouts on 3 days" },
] as const;

export function achievementsToUnlock(input: {
  eligible: boolean;
  priorEligible: number;
  cameraPerfects: number;
  cameraBestCombo: number;
  eligibleLifetimeTokens: number;
  eligibleKolkataDays: number;
  already: string[];
}) {
  const unlocked = new Set(input.already);
  const earned: Array<{ key: string; title: string }> = [];
  const consider = (key: string, title: string, ok: boolean) => {
    if (ok && !unlocked.has(key)) earned.push({ key, title });
  };
  consider("first_eligible_workout", "First eligible workout", input.eligible && input.priorEligible === 0);
  consider("ten_perfects", "10 perfects in one workout", input.eligible && input.cameraPerfects >= 10);
  consider("combo_x5", "5x combo", input.eligible && input.cameraBestCombo >= 5);
  consider("hundred_tokens", "100 tokens", input.eligibleLifetimeTokens >= 100);
  consider("three_workout_days", "Eligible workouts on 3 days", input.eligibleKolkataDays >= 3);
  return earned;
}

export type ClaimRow = {
  id: string;
  userId: string;
  progress: number;
  target: number;
  xp: number;
  claimedAt: string | null;
};

export function decideClaim(row: ClaimRow | null, userId: string) {
  if (!row || row.userId !== userId) return { type: "missing" as const };
  if (row.claimedAt) return { type: "already" as const };
  if (row.progress < row.target) return { type: "incomplete" as const };
  return { type: "grant" as const, amount: row.xp };
}

export type MemoryLedger = {
  missions: ClaimRow[];
  entries: Map<string, number>;
  totals: Map<string, number>;
};

export function grantOnce(ledger: MemoryLedger, userId: string, sourceId: string, amount: number) {
  const key = `${userId}:${sourceId}`;
  if (ledger.entries.has(key)) return 0;
  ledger.entries.set(key, amount);
  ledger.totals.set(userId, (ledger.totals.get(userId) ?? 0) + amount);
  return amount;
}

export function claimInLedger(ledger: MemoryLedger, userId: string, missionId: string) {
  const row = ledger.missions.find((mission) => mission.id === missionId) ?? null;
  const decision = decideClaim(row, userId);
  const total = () => ledger.totals.get(userId) ?? 0;
  if (decision.type !== "grant" || !row) return { xpGranted: 0, total: total(), code: decision.type };
  const granted = grantOnce(ledger, userId, row.id, decision.amount);
  if (granted > 0) row.claimedAt = "claimed";
  return { xpGranted: granted, total: total(), code: granted > 0 ? "granted" : "already" };
}

export type HistoryRow = { userId: string; id: string };

export function historyForViewer<T extends HistoryRow>(viewerId: string | null, rows: T[]) {
  if (!viewerId) return { status: 401 as const, rows: [] as T[] };
  return { status: 200 as const, rows: rows.filter((row) => row.userId === viewerId) };
}

const DIFFICULTIES = new Set(["easy", "steady", "hard"]);

export function parseProfilePatch(body: unknown):
  | { ok: true; weightKg: number | null; difficulty: "easy" | "steady" | "hard" | null; fitnessGoal: string | null }
  | { ok: false; message: string } {
  const record = asRecord(body);
  if (!record) return { ok: false, message: "Enter a valid profile." };
  if ("userId" in record || "xp" in record || "xpTotal" in record || "calories" in record) {
    return { ok: false, message: "That field cannot be set from the client." };
  }
  const weight = parseWeightKg("weightKg" in record ? record.weightKg : null);
  if (weight === undefined) return { ok: false, message: "Weight must be between 30 and 250 kg." };
  let difficulty: "easy" | "steady" | "hard" | null = null;
  if (record.difficulty !== undefined && record.difficulty !== null && record.difficulty !== "") {
    if (typeof record.difficulty !== "string" || !DIFFICULTIES.has(record.difficulty)) {
      return { ok: false, message: "Choose easy, steady, or hard." };
    }
    difficulty = record.difficulty as "easy" | "steady" | "hard";
  }
  let fitnessGoal: string | null = null;
  if (record.fitnessGoal !== undefined && record.fitnessGoal !== null && record.fitnessGoal !== "") {
    if (typeof record.fitnessGoal !== "string") return { ok: false, message: "Goal must be text." };
    const goal = record.fitnessGoal.trim();
    if (goal.length > 80) return { ok: false, message: "Keep the goal under 80 characters." };
    fitnessGoal = goal.length > 0 ? goal : null;
  }
  return { ok: true, weightKg: weight, difficulty, fitnessGoal };
}
