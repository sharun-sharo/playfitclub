import type { ControlMode, GymBranding, SessionStatus } from "@fitplay/shared";

export interface StoredPlayer {
  id: string;
  sessionId: string;
  userId: string | null;
  displayName: string;
  slot: number;
  control: ControlMode;
  ready: boolean;
  finalScore: number | null;
  connected: boolean;
  connectedAt: string;
  disconnectedAt: string | null;
}

export interface StoredSession {
  id: string;
  joinCode: string;
  gymId: string | null;
  gymName: string | null;
  branding: GymBranding | null;
  gameSlug: string;
  gameName: string;
  ownerId: string | null;
  status: SessionStatus;
  seed: number;
  durationSeconds: number;
  lives: number;
  maxPlayers: number;
  expiresAt: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  players: StoredPlayer[];
}

export interface CreateSessionInput {
  gameSlug: string;
  ownerId?: string | null;
  gymId?: string | null;
  durationSeconds: number;
  lives: number;
  maxPlayers: number;
  seed: number;
  expiresAt: Date;
}

export interface AddPlayerInput {
  sessionId: string;
  userId?: string | null;
  displayName: string;
  control: ControlMode;
  ready?: boolean;
}

export interface ResultInput {
  playerId: string;
  score: number;
  movementsCompleted: number;
  rewardsCollected: number;
  misses: number;
  maxCombo: number;
  durationSeconds: number;
}

export interface SavedResult extends ResultInput {
  id: string;
  shareSlug: string;
  personalBest: boolean;
  displayName: string;
}

export interface SessionRepository {
  createSession(input: CreateSessionInput): Promise<StoredSession>;
  findByCode(code: string): Promise<StoredSession | null>;
  findById(id: string): Promise<StoredSession | null>;
  addPlayer(input: AddPlayerInput): Promise<StoredPlayer>;
  removePlayer(sessionId: string, playerId: string): Promise<void>;
  setPlayerReady(sessionId: string, playerId: string, ready: boolean): Promise<void>;
  setPlayerControl(sessionId: string, playerId: string, control: ControlMode, ready: boolean): Promise<void>;
  setPlayerConnection(sessionId: string, playerId: string, connected: boolean): Promise<void>;
  updateStatus(sessionId: string, status: SessionStatus, times?: { startedAt?: Date; endedAt?: Date }): Promise<void>;
  saveResults(sessionId: string, results: ResultInput[]): Promise<SavedResult[]>;
  expireDue(now: Date): Promise<number>;
}
