import { createJoinCode, type ControlMode, type SessionStatus } from "@fitplay/shared";
import type {
  AddPlayerInput,
  CreateSessionInput,
  ResultInput,
  SavedResult,
  SessionRepository,
  StoredPlayer,
  StoredSession,
} from "./repository";

function id(): string {
  return crypto.randomUUID();
}

export function createMemoryRepository(): SessionRepository {
  const sessions = new Map<string, StoredSession>();
  const results: SavedResult[] = [];

  const find = async (predicate: (session: StoredSession) => boolean) => {
    return [...sessions.values()].find(predicate) ?? null;
  };

  return {
    async createSession(input: CreateSessionInput): Promise<StoredSession> {
      let joinCode = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        joinCode = createJoinCode(crypto.getRandomValues(new Uint8Array(6)));
        if (![...sessions.values()].some((session) => session.joinCode === joinCode)) break;
      }
      const now = new Date().toISOString();
      const session: StoredSession = {
        id: id(),
        joinCode,
        gymId: input.gymId ?? null,
        gymName: null,
        branding: null,
        gameSlug: input.gameSlug,
        gameName: input.gameSlug === "fitrunner" ? "FitRunner" : input.gameSlug,
        ownerId: input.ownerId ?? null,
        status: "LOBBY",
        seed: input.seed,
        durationSeconds: input.durationSeconds,
        lives: input.lives,
        maxPlayers: input.maxPlayers,
        expiresAt: input.expiresAt.toISOString(),
        startedAt: null,
        endedAt: null,
        createdAt: now,
        players: [],
      };
      sessions.set(session.id, session);
      return structuredClone(session);
    },
    findByCode(code: string) {
      return find((session) => session.joinCode === code.toUpperCase()).then((session) =>
        session ? structuredClone(session) : null,
      );
    },
    findById(sessionId: string) {
      const session = sessions.get(sessionId);
      return Promise.resolve(session ? structuredClone(session) : null);
    },
    async addPlayer(input: AddPlayerInput): Promise<StoredPlayer> {
      const session = sessions.get(input.sessionId);
      if (!session) throw new Error("SESSION_NOT_FOUND");
      if (session.players.length >= session.maxPlayers) throw new Error("SESSION_FULL");
      const used = new Set(session.players.map((player) => player.slot));
      let slot = 0;
      while (used.has(slot)) slot += 1;
      const player: StoredPlayer = {
        id: id(),
        sessionId: session.id,
        userId: input.userId ?? null,
        displayName: input.displayName,
        slot,
        control: input.control,
        ready: input.ready ?? false,
        finalScore: null,
        connected: true,
        connectedAt: new Date().toISOString(),
        disconnectedAt: null,
      };
      session.players.push(player);
      return structuredClone(player);
    },
    async removePlayer(sessionId: string, playerId: string) {
      const session = sessions.get(sessionId);
      if (!session) return;
      session.players = session.players.filter((player) => player.id !== playerId);
    },
    async setPlayerReady(sessionId: string, playerId: string, ready: boolean) {
      const player = sessions.get(sessionId)?.players.find((item) => item.id === playerId);
      if (player) player.ready = ready;
    },
    async setPlayerControl(sessionId: string, playerId: string, control: ControlMode, ready: boolean) {
      const player = sessions.get(sessionId)?.players.find((item) => item.id === playerId);
      if (!player) return;
      player.control = control;
      player.ready = ready;
    },
    async setPlayerConnection(sessionId: string, playerId: string, connected: boolean) {
      const player = sessions.get(sessionId)?.players.find((item) => item.id === playerId);
      if (!player) return;
      player.connected = connected;
      player.disconnectedAt = connected ? null : new Date().toISOString();
    },
    async updateStatus(sessionId: string, status: SessionStatus, times?: { startedAt?: Date; endedAt?: Date }) {
      const session = sessions.get(sessionId);
      if (!session) return;
      session.status = status;
      if (times?.startedAt) session.startedAt = times.startedAt.toISOString();
      if (times?.endedAt) session.endedAt = times.endedAt.toISOString();
    },
    async saveResults(sessionId: string, incoming: ResultInput[]): Promise<SavedResult[]> {
      const session = sessions.get(sessionId);
      if (!session) return [];
      const saved = incoming.map((result) => {
        const player = session.players.find((item) => item.id === result.playerId);
        player && (player.finalScore = result.score);
        const previous = results
          .filter((item) => item.playerId === result.playerId)
          .reduce((max, item) => Math.max(max, item.score), 0);
        const row: SavedResult = {
          ...result,
          id: id(),
          shareSlug: id().slice(0, 10),
          personalBest: previous === 0 ? result.score > 0 : result.score > previous,
          displayName: player?.displayName ?? "Player",
        };
        results.push(row);
        return row;
      });
      return saved;
    },
    async expireDue(now: Date) {
      let count = 0;
      for (const session of sessions.values()) {
        if (session.status === "LOBBY" && new Date(session.expiresAt).getTime() <= now.getTime()) {
          session.status = "EXPIRED";
          count += 1;
        }
      }
      return count;
    },
  };
}

export type { ControlMode };
