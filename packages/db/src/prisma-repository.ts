import { createJoinCode, type GymBranding, type SessionStatus } from "@fitplay/shared";
import { assertCanStartGameplay, BillingError } from "./billing/service";
import { readBranding, readConfig, readRun } from "./branding";
import { getPrisma } from "./client";
import type {
  AddPlayerInput,
  CreateSessionInput,
  ResultInput,
  SavedResult,
  SessionRepository,
  StoredPlayer,
  StoredSession,
} from "./repository";

const sessionInclude = {
  game: true,
  gym: true,
  players: { orderBy: { playerSlot: "asc" as const } },
};

type SessionRow = Awaited<ReturnType<ReturnType<typeof getPrisma>["gameSession"]["findFirstOrThrow"]>> & {
  game: { slug: string; name: string };
  gym: { name: string; branding: unknown } | null;
  players: Array<{
    id: string;
    sessionId: string;
    userId: string | null;
    displayName: string;
    playerSlot: number;
    control: "CAMERA" | "KEYBOARD";
    ready: boolean;
    finalScore: number | null;
    connectedAt: Date;
    disconnectedAt: Date | null;
  }>;
};

function mapPlayer(player: SessionRow["players"][number]): StoredPlayer {
  return {
    id: player.id,
    sessionId: player.sessionId,
    userId: player.userId,
    displayName: player.displayName,
    slot: player.playerSlot,
    control: player.control === "KEYBOARD" ? "keyboard" : "camera",
    ready: player.ready,
    finalScore: player.finalScore,
    connected: player.disconnectedAt === null,
    connectedAt: player.connectedAt.toISOString(),
    disconnectedAt: player.disconnectedAt?.toISOString() ?? null,
  };
}

function mapSession(row: SessionRow): StoredSession {
  const config = readConfig(row.configuration);
  return {
    id: row.id,
    joinCode: row.joinCode,
    gymId: row.gymId,
    gymName: row.gym?.name ?? null,
    branding: readBranding(row.gym?.branding) satisfies GymBranding | null,
    gameSlug: row.game.slug,
    gameName: row.game.name,
    ownerId: row.ownerId,
    status: row.status,
    seed: config.seed,
    durationSeconds: config.durationSeconds,
    lives: config.lives,
    maxPlayers: config.maxPlayers,
    run: readRun(row.configuration),
    expiresAt: row.expiresAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    players: row.players.map(mapPlayer),
  };
}

export class RepositoryError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createPrismaRepository(): SessionRepository {
  const prisma = getPrisma();

  return {
    async createSession(input: CreateSessionInput): Promise<StoredSession> {
      const game = await prisma.game.findUnique({ where: { slug: input.gameSlug } });
      if (!game || !game.enabled) throw new RepositoryError("GAME_UNAVAILABLE", "That game is not available");
      if (input.ownerId) {
        try {
          await assertCanStartGameplay(input.ownerId);
        } catch (error) {
          if (error instanceof BillingError) throw new RepositoryError(error.code, error.message);
          throw error;
        }
      }
      if (input.gymId) {
        const gym = await prisma.gym.findUnique({ where: { id: input.gymId } });
        if (!gym) throw new RepositoryError("GYM_NOT_FOUND", "Gym not found");
        if (gym.subscriptionStatus === "EXPIRED") {
          throw new RepositoryError("SUBSCRIPTION_EXPIRED", "This gym subscription has expired. History is unchanged. New play waits until the PlayFit Club team renews it.");
        }
      }
      let createdId = "";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const joinCode = createJoinCode(crypto.getRandomValues(new Uint8Array(6)));
        try {
          const created = await prisma.gameSession.create({
            data: {
              joinCode,
              gymId: input.gymId ?? null,
              gameId: game.id,
              ownerId: input.ownerId ?? null,
              status: "LOBBY",
              expiresAt: input.expiresAt,
              configuration: {
                seed: input.seed,
                durationSeconds: input.durationSeconds,
                lives: input.lives,
                maxPlayers: input.maxPlayers,
              },
            },
            include: sessionInclude,
          });
          createdId = created.id;
          return mapSession(created as SessionRow);
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code !== "P2002") throw error;
        }
      }
      if (!createdId) throw new RepositoryError("JOIN_CODE_COLLISION", "Could not allocate a join code");
      throw new RepositoryError("JOIN_CODE_COLLISION", "Could not allocate a join code");
    },
    async findByCode(code: string) {
      const row = await prisma.gameSession.findUnique({ where: { joinCode: code.toUpperCase() }, include: sessionInclude });
      return row ? mapSession(row as SessionRow) : null;
    },
    async findById(id: string) {
      const row = await prisma.gameSession.findUnique({ where: { id }, include: sessionInclude });
      return row ? mapSession(row as SessionRow) : null;
    },
    async addPlayer(input: AddPlayerInput) {
      const session = await prisma.gameSession.findUnique({
        where: { id: input.sessionId },
        include: { players: true },
      });
      if (!session) throw new RepositoryError("SESSION_NOT_FOUND", "Session not found");
      const config = readConfig(session.configuration);
      const phones = session.players.filter((player) => player.control !== "KEYBOARD");
      const hasKeyboard = session.players.some((player) => player.control === "KEYBOARD");
      if (input.control === "keyboard") {
        if (hasKeyboard) throw new RepositoryError("SESSION_FULL", "This session is full");
      } else if (phones.length >= config.maxPlayers) {
        throw new RepositoryError("SESSION_FULL", "This session is full");
      }
      const used = new Set(session.players.map((player) => player.playerSlot));
      let slot = 0;
      while (used.has(slot)) slot += 1;
      const player = await prisma.sessionPlayer.create({
        data: {
          sessionId: input.sessionId,
          userId: input.userId ?? null,
          displayName: input.displayName,
          playerSlot: slot,
          control: input.control === "keyboard" ? "KEYBOARD" : "CAMERA",
          ready: input.ready ?? false,
        },
      });
      return mapPlayer(player);
    },
    async removePlayer(sessionId, playerId) {
      await prisma.sessionPlayer.deleteMany({ where: { id: playerId, sessionId } });
    },
    async setPlayerReady(sessionId, playerId, ready) {
      await prisma.sessionPlayer.updateMany({ where: { id: playerId, sessionId }, data: { ready } });
    },
    async setPlayerControl(sessionId, playerId, control, ready) {
      await prisma.sessionPlayer.updateMany({
        where: { id: playerId, sessionId },
        data: { control: control === "keyboard" ? "KEYBOARD" : "CAMERA", ready },
      });
    },
    async setPlayerConnection(sessionId, playerId, connected) {
      await prisma.sessionPlayer.updateMany({
        where: { id: playerId, sessionId },
        data: { disconnectedAt: connected ? null : new Date() },
      });
    },
    async updateRun(sessionId, run) {
      const row = await prisma.gameSession.findUnique({ where: { id: sessionId }, select: { configuration: true } });
      if (!row) return;
      const configuration = { ...(row.configuration as Record<string, unknown>), run: { ...run, obstacleIds: [...run.obstacleIds] } };
      await prisma.gameSession.update({ where: { id: sessionId }, data: { configuration } });
    },
    async updateStatus(sessionId, status: SessionStatus, times) {
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          status,
          startedAt: times?.startedAt,
          endedAt: times?.endedAt,
        },
      });
    },
    async saveResults(sessionId, incoming: ResultInput[]): Promise<SavedResult[]> {
      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: { players: true, game: true },
      });
      if (!session) return [];
      const saved: SavedResult[] = [];
      for (const result of incoming) {
        const player = session.players.find((item) => item.id === result.playerId);
        if (!player) continue;
        let personalBest = false;
        if (player.userId) {
          const previous = await prisma.gameResult.findFirst({
            where: { player: { userId: player.userId }, session: { gameId: session.gameId } },
            orderBy: { score: "desc" },
          });
          personalBest = !previous || result.score > previous.score;
        }
        const row = await prisma.gameResult.create({
          data: {
            sessionId,
            playerId: result.playerId,
            score: result.score,
            movementsCompleted: result.movementsCompleted,
            rewardsCollected: result.rewardsCollected,
            misses: result.misses,
            maxCombo: result.maxCombo,
            durationSeconds: result.durationSeconds,
            personalBest,
            shareSlug: createJoinCode(crypto.getRandomValues(new Uint8Array(6))).toLowerCase() + createJoinCode(crypto.getRandomValues(new Uint8Array(6))).toLowerCase().slice(0, 4),
          },
        });
        await prisma.sessionPlayer.update({ where: { id: player.id }, data: { finalScore: result.score } });
        if (player.userId) await unlockAchievements(player.userId, result, personalBest);
        saved.push({
          ...result,
          id: row.id,
          shareSlug: row.shareSlug,
          personalBest,
          displayName: player.displayName,
        });
      }
      return saved;
    },
    async expireDue(now: Date) {
      const result = await prisma.gameSession.updateMany({
        where: { status: "LOBBY", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      return result.count;
    },
  };
}

async function unlockAchievements(userId: string, result: ResultInput, personalBest: boolean) {
  const prisma = getPrisma();
  const grants: Array<{ key: string; title: string }> = [{ key: "first_session", title: "First finish" }];
  if (result.score >= 1000) grants.push({ key: "score_1000", title: "Four figures" });
  if (result.maxCombo >= 10) grants.push({ key: "combo_10", title: "Unbroken chain" });
  if (personalBest && result.score > 0) grants.push({ key: "personal_best", title: "New personal best" });
  if (result.misses === 0 && result.score > 0) grants.push({ key: "clean_run", title: "Clean run" });
  for (const grant of grants) {
    await prisma.achievement.upsert({
      where: { userId_key: { userId, key: grant.key } },
      update: {},
      create: { userId, key: grant.key, title: grant.title },
    });
  }
}
