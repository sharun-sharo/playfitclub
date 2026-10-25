import { DEFAULT_THRESHOLDS, type MovementThresholds } from "@fitplay/game";

export const MOTION_THRESHOLD_KEY = "fitplay.motion.thresholds";

export const MOTION_THRESHOLD_FIELDS = [
  { key: "minActionConfidence", label: "confidence", min: 0.35, max: 0.95, step: 0.01 },
  { key: "halfwayOutEnter", label: "chest out", min: 0.25, max: 0.9, step: 0.01 },
  { key: "halfwayOutExit", label: "chest reset", min: 0.08, max: 0.6, step: 0.01 },
  { key: "halfwayElbowMin", label: "chest elbow", min: 55, max: 140, step: 1 },
  { key: "sidewaysReachEnter", label: "side reach", min: 0.7, max: 1.8, step: 0.01 },
  { key: "sidewaysElbowEnter", label: "side elbow", min: 85, max: 160, step: 1 },
  { key: "armHoldMs", label: "hold ms", min: 0, max: 400, step: 1 },
  { key: "torsoLeanEnter", label: "lean distance", min: 0.08, max: 0.45, step: 0.01 },
  { key: "torsoLeanNeutral", label: "lean reset", min: 0.02, max: 0.2, step: 0.01 },
  { key: "torsoLeanHoldMs", label: "lean confirm", min: 0, max: 120, step: 1 },
  { key: "squatEnterDrop", label: "squat drop", min: 0.12, max: 0.55, step: 0.01 },
  { key: "squatKneeEnter", label: "knee °", min: 100, max: 160, step: 1 },
  { key: "jumpRise", label: "jump rise", min: 0.2, max: 1.4, step: 0.01 },
  { key: "jumpAnkleRise", label: "ankle rise", min: 0, max: 0.2, step: 0.005 },
  { key: "recoverMs", label: "recover ms", min: 0, max: 500, step: 10 },
  { key: "cooldownMs", label: "cooldown", min: 0, max: 600, step: 10 },
] as const satisfies ReadonlyArray<{ key: keyof MovementThresholds; label: string; min: number; max: number; step: number }>;

export function readMotionThresholds(): Partial<MovementThresholds> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MOTION_THRESHOLD_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const clean = sanitizeThresholds(parsed);
    return Object.keys(clean).length > 0 ? clean : null;
  } catch {
    return null;
  }
}

export function writeMotionThresholds(values: Partial<MovementThresholds>) {
  window.localStorage.setItem(MOTION_THRESHOLD_KEY, JSON.stringify(sanitizeThresholds(values)));
}

export function thresholdDefaults(): Record<(typeof MOTION_THRESHOLD_FIELDS)[number]["key"], number> {
  const draft = {} as Record<(typeof MOTION_THRESHOLD_FIELDS)[number]["key"], number>;
  for (const field of MOTION_THRESHOLD_FIELDS) draft[field.key] = Number(DEFAULT_THRESHOLDS[field.key]);
  return draft;
}

export function thresholdDraft(): Record<(typeof MOTION_THRESHOLD_FIELDS)[number]["key"], number> {
  const stored = readMotionThresholds() ?? {};
  const draft = {} as Record<(typeof MOTION_THRESHOLD_FIELDS)[number]["key"], number>;
  for (const field of MOTION_THRESHOLD_FIELDS) {
    const value = stored[field.key];
    draft[field.key] = typeof value === "number" ? value : Number(DEFAULT_THRESHOLDS[field.key]);
  }
  return draft;
}

export function sanitizeThresholds(value: unknown): Partial<MovementThresholds> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const next: Partial<MovementThresholds> = {};
  for (const field of MOTION_THRESHOLD_FIELDS) {
    const raw = record[field.key];
    const numeric = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
    if (!Number.isFinite(numeric)) continue;
    next[field.key] = Math.min(field.max, Math.max(field.min, numeric));
  }
  if (next.halfwayOutEnter !== undefined && next.halfwayOutExit !== undefined && next.halfwayOutExit >= next.halfwayOutEnter) {
    next.halfwayOutExit = Math.max(0.08, next.halfwayOutEnter - 0.08);
  }
  if (next.torsoLeanEnter !== undefined && next.torsoLeanNeutral !== undefined && next.torsoLeanNeutral >= next.torsoLeanEnter) {
    next.torsoLeanNeutral = Math.max(0.02, next.torsoLeanEnter - 0.04);
  }
  return next;
}
