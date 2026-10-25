import { PLAYER_STATUSES, type PlayerStatusName } from "@fitplay/shared";

export interface PlayerView {
  id: string;
  displayName: string;
  slot: number;
  ready: boolean;
  connected: boolean;
  control: "camera" | "keyboard";
  score: number;
}

/** Phone `player:status` payload. Absent until that event arrives. */
export interface PhoneTracking {
  status: PlayerStatusName;
  confidence?: number;
  message?: string;
}

export interface SessionState {
  id: string;
  joinCode: string;
  gameName: string;
  phase: string;
  maxPlayers: number;
  durationSeconds: number;
  gymName?: string | null;
  branding?: { tagline?: string; accent?: string; logoText?: string } | null;
  statusMessage?: string | null;
  players: PlayerView[];
  tracking?: PhoneTracking;
}

const TRACKING_STATUSES = new Set<PhoneTracking["status"]>(PLAYER_STATUSES);

export function readPhoneTracking(value: unknown): PhoneTracking | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { status?: unknown; confidence?: unknown; message?: unknown };
  if (typeof record.status !== "string" || !TRACKING_STATUSES.has(record.status as PhoneTracking["status"])) return undefined;
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence) ? record.confidence : undefined;
  const message = typeof record.message === "string" && record.message.trim() ? record.message.trim() : undefined;
  return { status: record.status as PhoneTracking["status"], confidence, message };
}

export type PlayAccessKind = "guest" | "free" | "individual" | "gym" | "expired" | "unknown";

export interface PlayAccess {
  kind: PlayAccessKind;
  displayName: string | null;
  email: string | null;
  status: string;
  homePlay: boolean;
  checkoutAvailable: boolean;
  shortRounds: boolean;
  longRoundAllowed: boolean;
  gymName: string | null;
  gymHref: string | null;
  gymSessionSlug: string | null;
}

export interface EndedPayload {
  endReason?: string;
  winnerId?: string | null;
  tie?: boolean;
  results: Array<{
    playerId: string;
    displayName: string;
    score: number;
    movementsCompleted: number;
    misses: number;
    personalBest: boolean;
    shareSlug: string;
  }>;
}
