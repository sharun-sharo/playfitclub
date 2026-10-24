import type { GymBranding, UserRole } from "@fitplay/shared";
import type { Prisma } from "@prisma/client";
import { readBranding } from "./branding";
import { getPrisma } from "./client";
import { grantStaffSeat } from "./gym/service";

export async function findUserByEmail(email: string) {
  return getPrisma().user.findUnique({ where: { email: email.toLowerCase() } });
}

export async function findUserById(id: string) {
  return getPrisma().user.findUnique({
    where: { id },
    include: { memberships: { include: { gym: true } }, ownedGyms: true },
  });
}

export async function createUser(input: { email: string; displayName: string; passwordHash: string; role?: UserRole }) {
  return getPrisma().user.create({
    data: {
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: input.role ?? "PLAYER",
    },
  });
}

export async function dashboardForUser(userId: string) {
  const prisma = getPrisma();
  const [results, achievements, sessions] = await Promise.all([
    prisma.gameResult.findMany({
      where: { player: { userId } },
      include: { session: { include: { game: true } }, player: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.achievement.findMany({ where: { userId }, orderBy: { unlockedAt: "desc" } }),
    prisma.gameSession.findMany({
      where: { OR: [{ ownerId: userId }, { players: { some: { userId } } }] },
      include: { game: true, players: true, gym: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const best = results.reduce((max, result) => Math.max(max, result.score), 0);
  return {
    bestScore: best,
    results: results.map(mapResult),
    achievements,
    sessions: sessions.map((session) => ({
      id: session.id,
      joinCode: session.joinCode,
      status: session.status,
      gameName: session.game.name,
      gymName: session.gym?.name ?? null,
      createdAt: session.createdAt.toISOString(),
      players: session.players.map((player) => ({
        displayName: player.displayName,
        score: player.finalScore,
      })),
    })),
  };
}

/** Public recorded TV results. Gym boards do not use this list and it does not accept a gym id. */
export async function leaderboard() {
  const rows = await getPrisma().gameResult.findMany({
    include: { player: true, session: { include: { game: true } } },
    orderBy: { score: "desc" },
    take: 25,
  });
  return rows.map((row) => ({
    score: row.score,
    displayName: row.player.displayName,
    gameName: row.session.game.name,
    createdAt: row.createdAt.toISOString(),
    shareSlug: row.shareSlug,
  }));
}

export async function popularGames() {
  const prisma = getPrisma();
  const games = await prisma.game.findMany({ include: { sessions: { select: { id: true } } } });
  return games
    .map((game) => ({ id: game.id, name: game.name, slug: game.slug, enabled: game.enabled, plays: game.sessions.length }))
    .sort((a, b) => b.plays - a.plays);
}

export async function adminOverview() {
  const prisma = getPrisma();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [users, gyms, sessions, live, results, errors] = await Promise.all([
    prisma.user.count(),
    prisma.gym.count(),
    prisma.gameSession.count(),
    prisma.gameSession.count({ where: { status: { in: ["LOBBY", "COUNTDOWN", "RUNNING", "PAUSED"] } } }),
    prisma.gameResult.count({ where: { createdAt: { gte: since } } }),
    prisma.operationalEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return { users, gyms, sessions, live, resultsLastDay: results, errors };
}

export async function listGyms() {
  const prisma = getPrisma();
  const [gyms, activeMembers] = await Promise.all([
    prisma.gym.findMany({
      include: { owner: true, _count: { select: { sessions: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.gymMembership.groupBy({ by: ["gymId"], where: { role: "MEMBER", status: "ACTIVE" }, _count: { _all: true } }),
  ]);
  const membersByGym = new Map(activeMembers.map((row) => [row.gymId, row._count._all]));
  return gyms.map((gym) => ({
    id: gym.id,
    name: gym.name,
    slug: gym.slug,
    subscriptionStatus: gym.subscriptionStatus,
    ownerName: gym.owner.displayName,
    ownerEmail: gym.owner.email,
    sessions: gym._count.sessions,
    members: membersByGym.get(gym.id) ?? 0,
    branding: readBranding(gym.branding),
    createdAt: gym.createdAt.toISOString(),
  }));
}

export async function listUsers() {
  const users = await getPrisma().user.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }));
}

export async function listSessions(limit = 40) {
  const sessions = await getPrisma().gameSession.findMany({
    include: { game: true, gym: true, players: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return sessions.map((session) => ({
    id: session.id,
    joinCode: session.joinCode,
    status: session.status,
    gameName: session.game.name,
    gymName: session.gym?.name ?? null,
    players: session.players.length,
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString() ?? null,
    endedAt: session.endedAt?.toISOString() ?? null,
  }));
}

export async function listFlags() {
  return getPrisma().featureFlag.findMany({ orderBy: { key: "asc" } });
}

export async function setFlag(key: string, enabled: boolean) {
  return getPrisma().featureFlag.update({ where: { key }, data: { enabled } });
}

export async function setGameEnabled(id: string, enabled: boolean) {
  return getPrisma().game.update({ where: { id }, data: { enabled } });
}

export async function setGymSubscription(id: string, subscriptionStatus: "ACTIVE" | "TRIALING" | "EXPIRED") {
  return getPrisma().gym.update({ where: { id }, data: { subscriptionStatus } });
}

export async function updateGymBranding(gymId: string, input: { name: string; branding: GymBranding }) {
  return getPrisma().gym.update({
    where: { id: gymId },
    data: { name: input.name, branding: input.branding as unknown as Prisma.InputJsonValue },
  });
}

export async function authorizeGymSession(userId: string, gymSlug: string) {
  const gym = await getPrisma().gym.findUnique({ where: { slug: gymSlug }, include: { memberships: true } });
  if (!gym) return { error: "Gym not found" } as const;
  const allowed = gym.ownerId === userId || gym.memberships.some((member) => member.userId === userId && member.status === "ACTIVE" && member.role !== "MEMBER");
  if (!allowed) return { error: "You cannot open sessions for this gym" } as const;
  if (gym.subscriptionStatus === "EXPIRED") {
    return { error: "This gym subscription has expired. Historical results are unchanged." } as const;
  }
  return { gymId: gym.id } as const;
}

export async function gymForOwner(userId: string) {
  const gym = await getPrisma().gym.findFirst({
    where: {
      OR: [
        { ownerId: userId },
        { memberships: { some: { userId, role: { in: ["OWNER", "STAFF"] }, status: "ACTIVE" } } },
      ],
    },
    include: { memberships: { where: { status: "ACTIVE" }, include: { user: true } }, owner: true },
  });
  if (!gym) return null;
  return {
    id: gym.id,
    name: gym.name,
    slug: gym.slug,
    subscriptionStatus: gym.subscriptionStatus,
    branding: readBranding(gym.branding),
    ownerId: gym.ownerId,
    staff: gym.memberships.map((membership) => ({
      userId: membership.userId,
      email: membership.user.email,
      displayName: membership.user.displayName,
      role: membership.role,
    })),
  };
}

export async function addGymStaff(gymId: string, email: string, role: "STAFF" | "MEMBER") {
  const user = await findUserByEmail(email);
  if (!user) return null;
  await grantStaffSeat(gymId, user.id, role);
  return user;
}

export async function publicResult(shareSlug: string) {
  const row = await getPrisma().gameResult.findUnique({
    where: { shareSlug },
    include: { player: true, session: { include: { game: true, gym: true } } },
  });
  if (!row) return null;
  return mapResult(row);
}

export async function recordOperationalEvent(input: { level: string; source: string; message: string; context?: unknown }) {
  await getPrisma().operationalEvent.create({
    data: {
      level: input.level,
      source: input.source,
      message: input.message,
      context: input.context === undefined ? undefined : (input.context as object),
    },
  });
}

export async function databaseHealthy(): Promise<boolean> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

function mapResult(row: {
  id: string;
  shareSlug: string;
  score: number;
  movementsCompleted: number;
  rewardsCollected: number;
  misses: number;
  maxCombo: number;
  durationSeconds: number;
  personalBest: boolean;
  createdAt: Date;
  player: { displayName: string };
  session: { game: { name: string }; gym?: { name: string } | null };
}) {
  return {
    id: row.id,
    shareSlug: row.shareSlug,
    displayName: row.player.displayName,
    score: row.score,
    movementsCompleted: row.movementsCompleted,
    rewardsCollected: row.rewardsCollected,
    misses: row.misses,
    maxCombo: row.maxCombo,
    durationSeconds: row.durationSeconds,
    personalBest: row.personalBest,
    gameName: row.session.game.name,
    gymName: row.session.gym?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
