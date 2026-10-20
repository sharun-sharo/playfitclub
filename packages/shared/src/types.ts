export const PROTOCOL_VERSION = 1 as const;

export const MOVEMENT_TYPES = [
  "lean_left",
  "lean_right",
  "squat",
  "jump",
  "punch",
  "hold",
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const USER_ROLES = ["PLAYER", "GYM_OWNER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const SESSION_STATUSES = [
  "LOBBY",
  "COUNTDOWN",
  "RUNNING",
  "PAUSED",
  "ENDED",
  "EXPIRED",
  "CLOSED",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export type Lane = 0 | 1 | 2;
export type ObstacleKind = "barrier" | "low" | "high";
export type RunnerAction = "run" | "jump" | "slide";
export type GamePhase = "lobby" | "countdown" | "running" | "paused" | "ended";
export type EndReason = "time" | "lives" | "forfeit" | "host";
export type ControlMode = "camera" | "keyboard";

export interface MovementEvent {
  v: typeof PROTOCOL_VERSION;
  eventId: string;
  playerId: string;
  sessionId: string;
  movementType: MovementType;
  confidence: number;
  clientTimestamp: number;
  sequenceNumber: number;
}

export interface ObstacleSnapshot {
  id: number;
  lane: Lane;
  kind: ObstacleKind;
  z: number;
}

export interface CoinSnapshot {
  id: number;
  lane: Lane;
  z: number;
}

export interface RunnerSnapshot {
  id: string;
  displayName: string;
  slot: number;
  lane: Lane;
  visualLane: number;
  action: RunnerAction;
  actionElapsed: number;
  lives: number;
  score: number;
  combo: number;
  maxCombo: number;
  rewards: number;
  successes: number;
  misses: number;
  connected: boolean;
  ready: boolean;
  control: ControlMode;
  eliminated: boolean;
}

export interface GameSnapshot {
  v: typeof PROTOCOL_VERSION;
  sessionId: string;
  phase: GamePhase;
  time: number;
  duration: number;
  countdown: number;
  speed: number;
  distance: number;
  serverTimeMs: number;
  obstacles: ObstacleSnapshot[];
  coins: CoinSnapshot[];
  runners: RunnerSnapshot[];
  endReason?: EndReason;
  winnerId?: string | null;
  tie?: boolean;
  statusMessage?: string;
}

export interface SessionPlayerView {
  id: string;
  displayName: string;
  slot: number;
  ready: boolean;
  connected: boolean;
  control: ControlMode;
  score: number;
}

export interface SessionView {
  id: string;
  joinCode: string;
  gameSlug: string;
  gameName: string;
  status: SessionStatus;
  maxPlayers: number;
  durationSeconds: number;
  expiresAt: string;
  gymName?: string | null;
  branding?: GymBranding | null;
  players: SessionPlayerView[];
}

export interface GymBranding {
  tagline: string;
  accent: string;
  logoText: string;
}

export interface GameResultView {
  id: string;
  shareSlug: string;
  displayName: string;
  score: number;
  movementsCompleted: number;
  rewardsCollected: number;
  misses: number;
  maxCombo: number;
  durationSeconds: number;
  personalBest: boolean;
  gameName: string;
  createdAt: string;
}
