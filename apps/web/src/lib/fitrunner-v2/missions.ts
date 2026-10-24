export const MISSION_TEMPLATES = [
  { key: "warmup_warrior", title: "Warm-Up Warrior", target: 3, xp: 100, gate: "camera" },
  { key: "dodge_master", title: "Dodge Master", target: 15, xp: 120, gate: "camera" },
  { key: "jump_champion", title: "Jump Champion", target: 10, xp: 100, gate: "camera" },
  { key: "squat_hero", title: "Squat Hero", target: 12, xp: 120, gate: "camera" },
  { key: "untouchable", title: "Untouchable", target: 2, xp: 180, gate: "camera" },
  { key: "perfect_moves", title: "Perfect Moves", target: 8, xp: 150, gate: "camera" },
  { key: "token_hunter", title: "Token Hunter", target: 30, xp: 100, gate: "camera" },
  { key: "combo_king", title: "Combo King", target: 5, xp: 150, gate: "camera" },
  { key: "finish_strong", title: "Finish Strong", target: 5, xp: 120, gate: "camera" },
  { key: "fitness_explorer", title: "Fitness Explorer", target: 5, xp: 200, gate: "camera" },
] as const;

/** Bonus for finishing the three drawn missions. Never one of the three. */
export const TRIPLE_VICTORY = {
  key: "triple_victory",
  title: "Triple Victory",
  target: 3,
  xp: 250,
  gate: "bonus",
} as const;

export type MissionTemplate = (typeof MISSION_TEMPLATES)[number];
export type MissionKey = MissionTemplate["key"];

/**
 * Boards already saved today keep these ids. Progress follows the closest catalog mission
 * when the action is the same. Squat clears and finished-workout counts stay on their own metrics.
 */
const LEGACY_MISSION_KEYS = {
  tokens_30: "token_hunter",
  tokens_50: "token_hunter",
  camera_minutes_5: "warmup_warrior",
  jumps_10: "jump_champion",
  dodges_15: "dodge_master",
  combo_5: "combo_king",
  clean_minutes_3: "untouchable",
} as const;

/** Saved on some boards from today. Hidden, and it no longer earns progress. */
const RETIRED_MISSION_KEYS = new Set(["nitro_charger"]);

export function isRetiredMission(key: string): boolean {
  return RETIRED_MISSION_KEYS.has(key);
}

export type DayFacts = {
  tokens: number;
  cameraTokens: number;
  cameraSquatClears: number;
  cameraSquats: number;
  cameraActiveMs: number;
  longestCameraActiveMs: number;
  cameraJumps: number;
  cameraLaneDodges: number;
  cameraPerfects: number;
  eligibleWorkouts: number;
  cameraBestCombo: number;
  cameraCleanMs: number;
};

export function kolkataDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Inclusive start and exclusive end of a Kolkata calendar day, in UTC. */
export function kolkataDayRange(dayKey: string): { start: Date; end: Date } {
  const [year, month, day] = dayKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1) - 5.5 * 60 * 60 * 1000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function msUntilKolkataMidnight(now: Date): number {
  const { end } = kolkataDayRange(kolkataDayKey(now));
  return Math.max(0, end.getTime() - now.getTime());
}

export function formatKolkataCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isBonusTemplate(key: string): boolean {
  return key === TRIPLE_VICTORY.key;
}

/** Same user and Kolkata day always get the same three templates. Triple Victory is not in this draw. */
export function pickMissionTemplates(userId: string, dayKey: string): MissionTemplate[] {
  return [...MISSION_TEMPLATES]
    .sort((a, b) => {
      const delta = hashString(`${userId}|${dayKey}|${a.key}`) - hashString(`${userId}|${dayKey}|${b.key}`);
      return delta || a.key.localeCompare(b.key);
    })
    .slice(0, 3);
}

type AssignedTemplate = MissionTemplate | typeof TRIPLE_VICTORY;

/**
 * A day that already has its three missions is left alone, including boards stored under older template ids.
 * A new day gets those three plus the Triple Victory bonus row.
 */
export function assignmentsForDay(existingKeys: readonly string[], userId: string, dayKey: string): AssignedTemplate[] {
  const dailyCount = existingKeys.filter((key) => !isBonusTemplate(key)).length;
  if (dailyCount >= 3) return [];
  const have = new Set(existingKeys);
  const picked = pickMissionTemplates(userId, dayKey).filter((template) => !have.has(template.key));
  if (dailyCount > 0 || have.has(TRIPLE_VICTORY.key)) return picked;
  return [...picked, TRIPLE_VICTORY];
}

function progressMetric(key: string): string {
  if (key in LEGACY_MISSION_KEYS) return LEGACY_MISSION_KEYS[key as keyof typeof LEGACY_MISSION_KEYS];
  return key;
}

export function missionProgress(key: string, facts: DayFacts): number {
  switch (progressMetric(key)) {
    case "token_hunter":
      return facts.cameraTokens;
    case "squat_clears_10":
      return facts.cameraSquatClears;
    case "squat_hero":
      return facts.cameraSquats;
    case "warmup_warrior":
      return Math.floor(facts.cameraActiveMs / 60_000);
    case "jump_champion":
      return facts.cameraJumps;
    case "dodge_master":
      return facts.cameraLaneDodges;
    case "workouts_2":
      return facts.eligibleWorkouts;
    case "finish_strong":
      return Math.floor(facts.longestCameraActiveMs / 60_000);
    case "combo_king":
      return facts.cameraBestCombo;
    case "untouchable":
      return Math.floor(facts.cameraCleanMs / 60_000);
    case "perfect_moves":
      return facts.cameraPerfects;
    case "fitness_explorer":
      return Math.min(facts.cameraJumps, facts.cameraSquats, facts.cameraLaneDodges);
    default:
      return 0;
  }
}

/** Triple Victory reaches its target only when every drawn mission is complete, and there are at least three. */
export function progressForBoard(rows: ReadonlyArray<{ templateKey: string; target: number }>, facts: DayFacts): number[] {
  const daily = rows.map((row) =>
    isBonusTemplate(row.templateKey) || isRetiredMission(row.templateKey) ? null : missionProgress(row.templateKey, facts),
  );
  let dailyCount = 0;
  let done = 0;
  daily.forEach((value, index) => {
    if (value === null) return;
    dailyCount += 1;
    if (value >= (rows[index]?.target ?? Number.POSITIVE_INFINITY)) done += 1;
  });
  const bonusProgress = dailyCount >= 3 && done >= dailyCount ? TRIPLE_VICTORY.target : Math.min(done, TRIPLE_VICTORY.target - 1);
  return rows.map((row, index) => {
    if (isRetiredMission(row.templateKey)) return 0;
    return isBonusTemplate(row.templateKey) ? bonusProgress : (daily[index] ?? 0);
  });
}

export function completedDailyMissions(rows: ReadonlyArray<{ templateKey: string; target: number }>, facts: DayFacts): number {
  const progress = progressForBoard(rows, facts);
  return rows.reduce((count, row, index) => {
    if (isBonusTemplate(row.templateKey) || isRetiredMission(row.templateKey)) return count;
    return count + ((progress[index] ?? 0) >= row.target ? 1 : 0);
  }, 0);
}

export function emptyDayFacts(): DayFacts {
  return {
    tokens: 0,
    cameraTokens: 0,
    cameraSquatClears: 0,
    cameraSquats: 0,
    cameraActiveMs: 0,
    longestCameraActiveMs: 0,
    cameraJumps: 0,
    cameraLaneDodges: 0,
    cameraPerfects: 0,
    eligibleWorkouts: 0,
    cameraBestCombo: 0,
    cameraCleanMs: 0,
  };
}
