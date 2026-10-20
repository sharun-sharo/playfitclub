import type { GymBranding } from "@fitplay/shared";

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
    maxPlayers: typeof record.maxPlayers === "number" ? record.maxPlayers : 2,
  };
}
