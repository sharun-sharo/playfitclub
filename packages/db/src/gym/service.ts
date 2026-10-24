import type { Prisma } from "@prisma/client";
import { BillingError } from "../billing/errors";
import { getPrisma } from "../client";
import {
  activePlayMemberships,
  assignmentLabel,
  decideAssignment,
  decideMemberLink,
  directoryAllowed,
  gymAtCompletion,
  inWindow,
  kolkataWindow,
  ownerGymId,
  playerGymId,
  publicBoard,
  rankGymScores,
  type BoardPeriod,
  type MembershipSpan,
} from "./policy";

type Tx = Prisma.TransactionClient;

const playerSelect = { id: true, email: true, displayName: true, phone: true, role: true, accountStatus: true, xpTotal: true } as const;

function isUnique(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2002";
}

function fail(decision: { ok: false; code: string; message: string }): never {
  const status = decision.code === "FORBIDDEN" ? 403 : decision.code === "NOT_ASSIGNED" ? 404 : 409;
  throw new BillingError(status, decision.code, decision.message);
}

async function lockUserAndGym(tx: Tx, userId: string, gymId: string | null) {
  await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  if (gymId) await tx.$executeRaw`SELECT "id" FROM "Gym" WHERE "id" = ${gymId} FOR UPDATE`;
}

async function seatSnapshot(tx: Tx, gymId: string, pendingAdjust = 0) {
  const [allocation, occupiedMembers, pendingInvites] = await Promise.all([
    tx.seatAllocation.findUnique({ where: { gymId }, select: { seatLimit: true } }),
    tx.gymMembership.count({ where: { gymId, role: "MEMBER", status: "ACTIVE" } }),
    tx.invitation.count({ where: { gymId, status: "PENDING", expiresAt: { gt: new Date() } } }),
  ]);
  return { seatLimit: allocation?.seatLimit ?? null, occupiedMembers, pendingInvites: Math.max(0, pendingInvites + pendingAdjust) };
}

function spanOf(row: { id: string; userId: string; gymId: string; role: "OWNER" | "STAFF" | "MEMBER"; status: "ACTIVE" | "ENDED"; assignedAt: Date; endedAt: Date | null }): MembershipSpan {
  return { id: row.id, userId: row.userId, gymId: row.gymId, role: row.role, status: row.status, assignedAt: row.assignedAt.getTime(), endedAt: row.endedAt?.getTime() ?? null };
}

async function endMembership(tx: Tx, id: string, endedAt: Date) {
  await tx.gymMembership.update({ where: { id }, data: { status: "ENDED", endedAt } });
}

export async function adminChangeMembership(
  actor: { id: string; role: string },
  input: { action: "assign" | "transfer" | "unassign"; userId: string; gymId?: string | null },
) {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(async (tx) => {
      const gymId = input.gymId ?? null;
      await lockUserAndGym(tx, input.userId, gymId);
      const player = await tx.user.findUnique({ where: { id: input.userId }, select: playerSelect });
      if (!player) throw new BillingError(404, "NOT_FOUND", "Player not found.");
      if (gymId && !(await tx.gym.findUnique({ where: { id: gymId }, select: { id: true } }))) {
        throw new BillingError(404, "NOT_FOUND", "Gym not found.");
      }
      const active = await tx.gymMembership.findFirst({ where: { userId: player.id, status: "ACTIVE" }, select: { id: true, gymId: true, role: true } });
      const seats = gymId ? await seatSnapshot(tx, gymId) : { seatLimit: null, occupiedMembers: 0, pendingInvites: 0 };
      const decision = decideAssignment({
        actorRole: actor.role,
        action: input.action,
        playerRole: player.role,
        playerStatus: player.accountStatus,
        active: active ? { gymId: active.gymId, role: active.role } : null,
        targetGymId: gymId,
        ...seats,
      });
      if (!decision.ok) fail(decision);
      const now = new Date();
      if (decision.mode === "noop") return { ok: true as const, mode: "noop" as const, userId: player.id, gymId: active?.gymId ?? gymId };
      if (decision.mode === "end") {
        if (!active) throw new BillingError(404, "NOT_ASSIGNED", "This player is not assigned to a gym.");
        await endMembership(tx, active.id, now);
        await tx.auditLog.create({
          data: { actorId: actor.id, action: "gym.unassign", targetType: "GymMembership", targetId: active.id, metadata: { userId: player.id, gymId: active.gymId } },
        });
        return { ok: true as const, mode: "end" as const, userId: player.id, gymId: active.gymId };
      }
      if (decision.mode === "transfer" && active) await endMembership(tx, active.id, now);
      if (!gymId) throw new BillingError(400, "INVALID", "Choose a gym.");
      const created = await tx.gymMembership.create({
        data: { userId: player.id, gymId, role: "MEMBER", status: "ACTIVE", assignedBy: actor.id, assignedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: decision.mode === "transfer" ? "gym.transfer" : "gym.assign",
          targetType: "GymMembership",
          targetId: created.id,
          metadata: { userId: player.id, gymId, previousGymId: active?.gymId ?? null },
        },
      });
      return { ok: true as const, mode: decision.mode, userId: player.id, gymId, membershipId: created.id };
    });
  } catch (error) {
    if (isUnique(error)) throw new BillingError(409, "ALREADY_ASSIGNED", "This player already has an active gym membership.");
    throw error;
  }
}

export async function linkPlayerToGym(input: { userId: string; gymId: string; assignedBy: string | null; pendingAdjust?: number }) {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(async (tx) => {
      await lockUserAndGym(tx, input.userId, input.gymId);
      const active = await tx.gymMembership.findFirst({ where: { userId: input.userId, status: "ACTIVE" }, select: { id: true, gymId: true, role: true } });
      const seats = await seatSnapshot(tx, input.gymId, input.pendingAdjust ?? 0);
      const decision = decideMemberLink({ active: active ? { gymId: active.gymId, role: active.role } : null, gymId: input.gymId, ...seats });
      if (!decision.ok) fail(decision);
      if (decision.mode === "noop") return { created: false as const };
      const created = await tx.gymMembership.create({
        data: { userId: input.userId, gymId: input.gymId, role: "MEMBER", status: "ACTIVE", assignedBy: input.assignedBy, assignedAt: new Date() },
      });
      return { created: true as const, membershipId: created.id };
    });
  } catch (error) {
    if (isUnique(error)) throw new BillingError(409, "ALREADY_ASSIGNED", "This player already has an active gym membership.");
    throw error;
  }
}

export async function grantStaffSeat(gymId: string, userId: string, role: "STAFF" | "MEMBER") {
  if (role === "MEMBER") return linkPlayerToGym({ userId, gymId, assignedBy: null });
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await lockUserAndGym(tx, userId, gymId);
    const active = await tx.gymMembership.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true, gymId: true } });
    if (active?.gymId === gymId) {
      await tx.gymMembership.update({ where: { id: active.id }, data: { role: "STAFF" } });
      return { created: false as const };
    }
    if (active) throw new BillingError(409, "ALREADY_ASSIGNED", "This account already belongs to another gym.");
    await tx.gymMembership.create({ data: { userId, gymId, role: "STAFF", status: "ACTIVE", assignedAt: new Date() } });
    return { created: true as const };
  });
}

export async function listAssignmentGyms() {
  const prisma = getPrisma();
  const gyms = await prisma.gym.findMany({
    include: {
      owner: { select: { id: true, displayName: true, email: true } },
      seatAllocation: { select: { seatLimit: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, startsAt: true, endsAt: true, plan: { select: { code: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  const occupied = await prisma.gymMembership.groupBy({ by: ["gymId"], where: { role: "MEMBER", status: "ACTIVE" }, _count: { _all: true } });
  const occupiedByGym = new Map(occupied.map((row) => [row.gymId, row._count._all]));
  return gyms.map((gym) => ({
    id: gym.id,
    name: gym.name,
    status: gym.subscriptionStatus,
    owner: { id: gym.owner.id, displayName: gym.owner.displayName, email: gym.owner.email },
    seatLimit: gym.seatAllocation?.seatLimit ?? null,
    occupied: occupiedByGym.get(gym.id) ?? 0,
    subscription: gym.subscriptions[0]
      ? {
          status: gym.subscriptions[0].status,
          plan: gym.subscriptions[0].plan.name,
          startsAt: gym.subscriptions[0].startsAt.toISOString(),
          endsAt: gym.subscriptions[0].endsAt.toISOString(),
        }
      : null,
  }));
}

export async function gymAssignmentDetail(gymId: string) {
  const gyms = await listAssignmentGyms();
  const gym = gyms.find((item) => item.id === gymId);
  if (!gym) return null;
  const players = await getPrisma().gymMembership.findMany({
    where: { gymId, role: "MEMBER", status: "ACTIVE" },
    include: { user: { select: { id: true, displayName: true, email: true } } },
    orderBy: { assignedAt: "desc" },
  });
  return {
    ...gym,
    players: players.map((row) => ({
      userId: row.user.id,
      displayName: row.user.displayName,
      email: row.user.email,
      assignedAt: row.assignedAt.toISOString(),
    })),
  };
}

export async function searchAssignablePlayers(input: { q?: string; page?: number; pageSize?: number }) {
  const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 50);
  const page = Math.max(input.page ?? 1, 1);
  const where = {
    role: { in: ["PLAYER" as const, "INDIVIDUAL" as const] },
    ...(input.q
      ? {
          OR: [
            { displayName: { contains: input.q, mode: "insensitive" as const } },
            { email: { contains: input.q, mode: "insensitive" as const } },
            { phone: { contains: input.q.replace(/\D/g, "") || input.q } },
          ],
        }
      : {}),
  };
  const prisma = getPrisma();
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        ...playerSelect,
        memberships: {
          where: { status: "ACTIVE" },
          select: { gymId: true, role: true, status: true, assignedAt: true, gym: { select: { name: true } } },
          take: 1,
        },
      },
      orderBy: { displayName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    page,
    pageSize,
    total,
    players: users.map((user) => {
      const current = activePlayMemberships(user.memberships)[0] ?? null;
      return {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        accountStatus: user.accountStatus,
        gymId: current?.gymId ?? null,
        gymName: current?.gym.name ?? null,
        membershipStatus: current ? "ACTIVE" : "UNASSIGNED",
      };
    }),
  };
}

export async function playerAssignmentHistory(userId: string) {
  const rows = await getPrisma().gymMembership.findMany({
    where: { userId },
    include: { gym: { select: { id: true, name: true } }, assigner: { select: { displayName: true } } },
    orderBy: { assignedAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    gymId: row.gym.id,
    gymName: row.gym.name,
    role: row.role,
    status: row.status,
    assignedAt: row.assignedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    assignedBy: row.assigner?.displayName ?? null,
  }));
}

async function ownedGymIdFor(userId: string) {
  const gym = await getPrisma().gym.findFirst({ where: { ownerId: userId }, select: { id: true }, orderBy: { createdAt: "asc" } });
  return gym?.id ?? null;
}

async function activeMemberGym(userId: string) {
  return getPrisma().gymMembership.findFirst({
    where: { userId, role: "MEMBER", status: "ACTIVE" },
    include: { gym: { select: { id: true, name: true, subscriptionStatus: true, seatAllocation: { select: { seatLimit: true } } } } },
  });
}

export async function resolveOwnerGym(userId: string, role: string, requestedGymId?: string | null) {
  const ownedGymIdValue = role === "GYM_OWNER" ? await ownedGymIdFor(userId) : null;
  return ownerGymId({ role, ownedGymId: ownedGymIdValue, requestedGymId });
}

function boardFacts(rows: Array<{ userId: string; score: number; xpAwarded: number; endedAt: Date | null; gameId: string | null; gymIdAtSession: string | null; user: { displayName: string } }>) {
  return rows.flatMap((row) => {
    if (!row.endedAt) return [];
    return [{
      userId: row.userId,
      displayName: row.user.displayName,
      gymId: row.gymIdAtSession,
      gameId: row.gameId,
      score: row.score,
      xp: row.xpAwarded,
      completedAt: row.endedAt.getTime(),
    }];
  });
}

async function rankedForGym(gymId: string, period: BoardPeriod, gameId: string | null, now = new Date()) {
  const window = kolkataWindow(period, now);
  const rows = await getPrisma().workoutSession.findMany({
    where: {
      gymIdAtSession: gymId,
      status: "COMPLETED",
      endedAt: {
        not: null,
        ...(window.start ? { gte: window.start } : {}),
        ...(window.end ? { lt: window.end } : {}),
      },
      ...(gameId ? { gameId } : {}),
    },
    select: { userId: true, score: true, xpAwarded: true, endedAt: true, gameId: true, gymIdAtSession: true, user: { select: { displayName: true } } },
  });
  const facts = boardFacts(rows).filter((fact) => fact.gymId === gymId && inWindow(fact.completedAt, window));
  return rankGymScores(facts, gymId, gameId);
}

export async function leaderboardForGym(gymId: string, period: BoardPeriod, gameId: string | null, now = new Date()) {
  return publicBoard(await rankedForGym(gymId, period, gameId, now));
}

export async function ownerFloor(userId: string, role: string) {
  const gymId = await resolveOwnerGym(userId, role, null);
  if (!gymId || !directoryAllowed({ role, ownerGymId: gymId }, gymId)) return null;
  const prisma = getPrisma();
  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    include: {
      owner: { select: { displayName: true } },
      seatAllocation: true,
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: { select: { name: true } } } },
    },
  });
  if (!gym || gym.ownerId !== userId) return null;
  const [occupied, games, recent] = await Promise.all([
    prisma.gymMembership.count({ where: { gymId, role: "MEMBER", status: "ACTIVE" } }),
    prisma.game.findMany({ where: { enabled: true }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
    prisma.workoutSession.findMany({
      where: { gymIdAtSession: gymId, status: "COMPLETED" },
      orderBy: { endedAt: "desc" },
      take: 8,
      select: { id: true, score: true, xpAwarded: true, endedAt: true, user: { select: { displayName: true } } },
    }),
  ]);
  const subscription = gym.subscriptions[0] ?? null;
  return {
    gym: {
      id: gym.id,
      name: gym.name,
      status: gym.subscriptionStatus,
      ownerName: gym.owner.displayName,
      seatLimit: gym.seatAllocation?.seatLimit ?? null,
      occupied,
      subscription: subscription
        ? { status: subscription.status, plan: subscription.plan.name, startsAt: subscription.startsAt.toISOString(), endsAt: subscription.endsAt.toISOString() }
        : null,
    },
    games,
    recent: recent.map((row) => ({
      id: row.id,
      displayName: row.user.displayName,
      score: row.score,
      xp: row.xpAwarded,
      completedAt: row.endedAt?.toISOString() ?? null,
    })),
  };
}

export async function ownerDirectory(userId: string, role: string, input: { q?: string; filter?: string; page?: number; pageSize?: number }) {
  const gymId = await resolveOwnerGym(userId, role, null);
  if (!gymId || !directoryAllowed({ role, ownerGymId: gymId }, gymId)) return null;
  const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 50);
  const page = Math.max(input.page ?? 1, 1);
  const filter = input.filter === "ended" ? "ENDED" : "ACTIVE";
  const prisma = getPrisma();
  const where = {
    gymId,
    role: "MEMBER" as const,
    status: filter as "ACTIVE" | "ENDED",
    ...(input.q ? { user: { displayName: { contains: input.q, mode: "insensitive" as const } } } : {}),
  };
  const [total, rows, ranked] = await Promise.all([
    prisma.gymMembership.count({ where }),
    prisma.gymMembership.findMany({
      where,
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { assignedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    rankedForGym(gymId, "all", null),
  ]);
  const ids = rows.map((row) => row.userId);
  const stats = ids.length
    ? await prisma.workoutSession.groupBy({
        by: ["userId"],
        where: { gymIdAtSession: gymId, status: "COMPLETED", userId: { in: ids } },
        _count: { _all: true },
        _max: { score: true, endedAt: true },
        _sum: { xpAwarded: true },
      })
    : [];
  const statByUser = new Map(stats.map((row) => [row.userId, row]));
  const rankByUser = new Map(ranked.map((row) => [row.userId, row.rank]));
  return {
    page,
    pageSize,
    total,
    players: rows.map((row) => {
      const stat = statByUser.get(row.userId);
      return {
        id: row.user.id,
        displayName: row.user.displayName,
        assignedAt: row.assignedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        status: row.status,
        lastActivity: stat?._max.endedAt?.toISOString() ?? null,
        sessions: stat?._count._all ?? 0,
        bestScore: stat?._max.score ?? 0,
        xp: stat?._sum.xpAwarded ?? 0,
        rank: rankByUser.get(row.userId) ?? null,
      };
    }),
  };
}

export async function playerHome(
  userId: string,
  options: { period?: BoardPeriod; gameId?: string | null; requestedGymId?: string | null } = {},
) {
  const prisma = getPrisma();
  const [user, membership, games] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { xpTotal: true, displayName: true } }),
    activeMemberGym(userId),
    prisma.game.findMany({ where: { enabled: true }, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
  ]);
  const gymId = playerGymId(membership?.gymId ?? null, options.requestedGymId);
  if (!gymId || !membership) {
    const label = assignmentLabel(null);
    return { ...label, gym: null, personalXp: user?.xpTotal ?? 0, gymXp: 0, bestScore: 0, rank: null, leaderboard: [], games: [] };
  }
  const [ranked, board, own] = await Promise.all([
    rankedForGym(gymId, "all", null),
    rankedForGym(gymId, options.period ?? "week", options.gameId ?? null),
    prisma.workoutSession.aggregate({
      where: { userId, gymIdAtSession: gymId, status: "COMPLETED" },
      _sum: { xpAwarded: true },
      _max: { score: true },
    }),
  ]);
  return {
    ...assignmentLabel(membership.gym.name),
    gym: { name: membership.gym.name, status: membership.status, subscriptionStatus: membership.gym.subscriptionStatus },
    personalXp: user?.xpTotal ?? 0,
    gymXp: own._sum.xpAwarded ?? 0,
    bestScore: own._max.score ?? 0,
    rank: ranked.find((row) => row.userId === userId)?.rank ?? null,
    leaderboard: publicBoard(board),
    games,
  };
}

export async function ownerBoard(userId: string, role: string, period: BoardPeriod, gameId: string | null) {
  const gymId = await resolveOwnerGym(userId, role, null);
  if (!gymId || !directoryAllowed({ role, ownerGymId: gymId }, gymId)) return null;
  return { leaderboard: await leaderboardForGym(gymId, period, gameId) };
}

export async function attributeCompletedWorkout(userId: string, completedAt: Date, tx: Tx) {
  await tx.$executeRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const [memberships, game] = await Promise.all([
    tx.gymMembership.findMany({ where: { userId, role: "MEMBER" } }),
    tx.game.findUnique({ where: { slug: "fitrunner" }, select: { id: true } }),
  ]);
  return {
    gymIdAtSession: gymAtCompletion(memberships.map(spanOf), completedAt.getTime()),
    gameId: game?.id ?? null,
  };
}
