import { RUN_LIVES, type GymBranding, type RunLives } from "@fitplay/shared";

export function readBranding(value: unknown): GymBranding | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.tagline !== "string" || typeof record.accent !== "string" || typeof record.logoText !== "string") {
    return null;
  }
  return { tagline: record.tagline, accent: record.accent, logoText: record.logoText };
}

export function readConfig(value: unknown): { seed: number; durationSeconds: number; lives: number; maxPlayers: number } {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    seed: typeof record.seed === "number" ? record.seed : 1,
    durationSeconds: typeof record.durationSeconds === "number" ? record.durationSeconds : 180,
    lives: typeof record.lives === "number" ? record.lives : 3,
    maxPlayers: typeof record.maxPlayers === "number" ? record.maxPlayers : 1,
  };
}

/** Reads the persisted FitRunner run. Missing data means no run is in progress. */
export function readRun(value: unknown): RunLives | null {
  if (!value || typeof value !== "object") return null;
  const run = (value as Record<string, unknown>).run;
  if (!run || typeof run !== "object") return null;
  const row = run as Record<string, unknown>;
  if (typeof row.lives !== "number" || !Number.isFinite(row.lives)) return null;
  const lives = Math.max(0, Math.min(RUN_LIVES, Math.floor(row.lives)));
  const hits =
    typeof row.hits === "number" && Number.isFinite(row.hits) ? Math.max(0, Math.min(RUN_LIVES, Math.floor(row.hits))) : RUN_LIVES - lives;
  const obstacleIds = Array.isArray(row.obstacleIds)
    ? row.obstacleIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 80).slice(0, RUN_LIVES)
    : [];
  return {
    active: row.active === true,
    over: row.over === true || lives === 0,
    lives,
    hits,
    obstacleIds,
    invulnerableUntil: typeof row.invulnerableUntil === "number" && Number.isFinite(row.invulnerableUntil) ? row.invulnerableUntil : 0,
  };
}
