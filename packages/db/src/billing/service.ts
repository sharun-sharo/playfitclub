import { createHash, randomBytes } from "node:crypto";
import type { Prisma, SubscriptionRecordStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getPrisma } from "../client";
import { BillingError } from "./errors";
import { linkPlayerToGym } from "../gym/service";
import {
  applyAdminCommand,
  canInvite,
  decidePlay,
  namesMatch,
  normalizePhone,
  seatLimitForPlan,
  type AuditDraft,
  type GymFlag,
  type GymLink,
  type PaidSub,
  type PlayDecision,
  type SubStatus,
} from "./policy";

export { BillingError } from "./errors";

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  phone: true,
  role: true,
  accountStatus: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type SubRow = {
  status: SubStatus;
  endsAt: Date;
  amountInr: number;
  gymId: string | null;
  userId: string | null;
  plan: { code: string };
};

const subSelect = {
  status: true,
  endsAt: true,
  amountInr: true,
  gymId: true,
  userId: true,
  plan: { select: { code: true } },
} satisfies Prisma.SubscriptionSelect;

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function temporaryPassword() {
  return randomBytes(18).toString("base64url");
}

function newToken() {
  return randomBytes(32).toString("base64url");
}

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "gym";
  return `${base}-${randomBytes(3).toString("hex")}`;
}

function paidFrom(row: SubRow): PaidSub {
  return {
    scope: row.userId ? "individual" : "gym",
    status: row.status,
    endsAt: row.endsAt.getTime(),
    paid: row.plan.code !== "free_demo",
    gymId: row.gymId,
  };
}

async function persistAudit(audit: AuditDraft) {
  await getPrisma().auditLog.create({
    data: {
      actorId: audit.actorId,
      action: audit.action,
      targetType: audit.targetType,
      targetId: audit.targetId,
      metadata: audit.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

function adminAudit(role: string, actorId: string, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  const journal = applyAdminCommand({ audits: [], payments: [] }, { role, actorId, action, targetType, targetId, metadata });
  const audit = journal.audits[0];
  if (!audit) throw new BillingError(500, "AUDIT", "The admin action did not produce an audit row.");
  return audit;
}

export async function findAuthState(id: string) {
  return getPrisma().user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      accountStatus: true,
      mustChangePassword: true,
      sessionVersion: true,
    },
  });
}

export async function playDecisionForUser(userId: string): Promise<PlayDecision> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: {
      accountStatus: true,
      mustChangePassword: true,
      individualSubscriptions: { select: subSelect },
      memberships: {
        where: { status: "ACTIVE" },
        select: {
          gym: {
            select: {
              id: true,
              subscriptionStatus: true,
              subscriptions: { select: subSelect },
            },
          },
        },
      },
      ownedGyms: {
        select: {
          id: true,
          subscriptionStatus: true,
          subscriptions: { select: subSelect },
        },
      },
    },
  });
  if (!user) {
    return decidePlay({ signedIn: true, accountStatus: "SUSPENDED", now: Date.now() });
  }
  const gyms = new Map<string, GymLink>();
  const add = (gym: { id: string; subscriptionStatus: GymFlag; subscriptions: SubRow[] }) => {
    gyms.set(gym.id, { gymId: gym.id, flag: gym.subscriptionStatus, subscriptions: gym.subscriptions.map(paidFrom) });
  };
  for (const membership of user.memberships) add(membership.gym);
  for (const gym of user.ownedGyms) add(gym);
  return decidePlay({
    signedIn: true,
    accountStatus: user.accountStatus,
    mustChangePassword: user.mustChangePassword,
    individualSubs: user.individualSubscriptions.map(paidFrom),
    gyms: [...gyms.values()],
    now: Date.now(),
  });
}

export async function assertCanStartGameplay(userId: string) {
  const decision = await playDecisionForUser(userId);
  if (!decision.allowed) {
    const error = new BillingError(
      403,
      decision.reason === "expired_individual" || decision.reason === "expired_gym" ? "SUBSCRIPTION_EXPIRED" : "PLAY_BLOCKED",
      decision.message,
    );
    throw error;
  }
  return decision;
}

export async function billingOverview() {
  const prisma = getPrisma();
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const activeWindow = { status: "ACTIVE" as const, endsAt: { gte: now } };
  const [
    users,
    gyms,
    activeIndividualSubs,
    activeGymSubRows,
    legacyActiveGyms,
    expired,
    expiring7,
    expiring30,
    seatSum,
    occupiedSeats,
    paid,
    partial,
    pendingPayments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.gym.count(),
    prisma.subscription.count({ where: { userId: { not: null }, ...activeWindow } }),
    prisma.subscription.count({ where: { gymId: { not: null }, ...activeWindow } }),
    prisma.gym.count({ where: { subscriptionStatus: "ACTIVE", subscriptions: { none: {} } } }),
    prisma.subscription.count({
      where: { OR: [{ status: "EXPIRED" }, { status: "ACTIVE", endsAt: { lt: now } }] },
    }),
    prisma.subscription.count({ where: { status: "ACTIVE", endsAt: { gte: now, lte: in7 } } }),
    prisma.subscription.count({ where: { status: "ACTIVE", endsAt: { gte: now, lte: in30 } } }),
    prisma.seatAllocation.aggregate({ _sum: { seatLimit: true } }),
    prisma.gymMembership.count({ where: { role: "MEMBER", status: "ACTIVE" } }),
    prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amountInr: true } }),
    prisma.payment.aggregate({ where: { status: "PARTIAL" }, _sum: { amountInr: true } }),
    prisma.payment.count({ where: { status: "PENDING" } }),
  ]);
  return {
    users,
    gyms,
    activeIndividualSubs,
    activeGymSubs: activeGymSubRows + legacyActiveGyms,
    expired,
    expiringIn7Days: expiring7,
    expiringIn30Days: expiring30,
    allocatedSeats: seatSum._sum.seatLimit ?? 0,
    occupiedSeats,
    recordedRevenueInr: (paid._sum.amountInr ?? 0) + (partial._sum.amountInr ?? 0),
    pendingPayments,
  };
}

export async function searchUsers(input: { q?: string; role?: string; plan?: string; accountStatus?: string; subscriptionStatus?: string }) {
  const users = await getPrisma().user.findMany({
    where: {
      AND: [
        input.q
          ? {
              OR: [
                { email: { contains: input.q, mode: "insensitive" } },
                { displayName: { contains: input.q, mode: "insensitive" } },
                { phone: { contains: input.q.replace(/\D/g, "") || input.q } },
              ],
            }
          : {},
        input.role ? { role: input.role as Prisma.EnumUserRoleFilter["equals"] } : {},
        input.accountStatus ? { accountStatus: input.accountStatus as "ACTIVE" | "SUSPENDED" } : {},
        input.plan ? { individualSubscriptions: { some: { plan: { code: input.plan } } } } : {},
        input.subscriptionStatus
          ? { individualSubscriptions: { some: { status: input.subscriptionStatus as SubscriptionRecordStatus } } }
          : {},
      ],
    },
    select: {
      ...userSelect,
      individualSubscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, startsAt: true, endsAt: true, amountInr: true, plan: { select: { code: true, name: true } } },
      },
      memberships: { where: { status: "ACTIVE" }, select: { gymId: true, role: true, gym: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return users.map((user) => ({
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    individualSubscriptions: user.individualSubscriptions.map((sub) => ({
      ...sub,
      startsAt: sub.startsAt.toISOString(),
      endsAt: sub.endsAt.toISOString(),
    })),
  }));
}

export async function createProvisionedUser(actor: { id: string; role: string }, input: { email: string; displayName: string; role: "INDIVIDUAL" | "GYM_OWNER" | "SUPER_ADMIN"; phone?: string }) {
  const prisma = getPrisma();
  const email = input.email.toLowerCase();
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) throw new BillingError(400, "INVALID", "Enter a mobile number, including +91.");
  if (await prisma.user.findUnique({ where: { email } })) throw new BillingError(409, "EXISTS", "An account with that email already exists.");
  if (phone) {
    const holders = await prisma.user.findMany({ where: { phone }, select: { displayName: true } });
    if (holders.some((holder) => namesMatch(holder.displayName, input.displayName))) {
      throw new BillingError(409, "EXISTS", "An account with this name and phone already exists. Choose that customer.");
    }
    if (holders.length > 0) {
      throw new BillingError(409, "PHONE", "That phone belongs to a different customer. Choose that customer instead of creating another account.");
    }
  }
  const password = temporaryPassword();
  const user = await prisma.user.create({
    data: {
      email,
      displayName: input.displayName.trim().replace(/\s+/g, " "),
      phone,
      role: input.role,
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: true,
      accountStatus: "ACTIVE",
    },
    select: userSelect,
  });
  await persistAudit(adminAudit(actor.role, actor.id, "user.create", "User", user.id, { role: input.role, email }));
  return {
    user: { ...user, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() },
    delivery: { temporaryPassword: password },
  };
}

export async function setAccountStatus(actor: { id: string; role: string }, userId: string, accountStatus: "ACTIVE" | "SUSPENDED") {
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw new BillingError(404, "NOT_FOUND", "That account was not found.");
  const user = await prisma.user.update({
    where: { id: userId },
    data: { accountStatus, sessionVersion: accountStatus === "SUSPENDED" ? { increment: 1 } : undefined },
    select: userSelect,
  });
  await persistAudit(adminAudit(actor.role, actor.id, accountStatus === "SUSPENDED" ? "user.suspend" : "user.reactivate", "User", userId, { accountStatus }));
  return { ...user, createdAt: user.createdAt.toISOString(), updatedAt: user.updatedAt.toISOString() };
}

export async function resetCredentials(actor: { id: string; role: string }, userId: string) {
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!existing) throw new BillingError(404, "NOT_FOUND", "That account was not found.");
  const password = temporaryPassword();
  const token = newToken();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true, sessionVersion: { increment: 1 } },
    }),
    prisma.passwordActivationToken.create({
      data: { userId, tokenHash: hashSecret(token), purpose: "RESET", expiresAt },
    }),
  ]);
  await persistAudit(adminAudit(actor.role, actor.id, "user.reset_credentials", "User", userId, {}));
  return { delivery: { temporaryPassword: password, activationPath: `/activate?token=${encodeURIComponent(token)}` } };
}

export async function changePassword(userId: string, input: { currentPassword: string; newPassword: string }) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true, email: true, displayName: true, role: true } });
  if (!user?.passwordHash || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
    throw new BillingError(401, "INVALID_LOGIN", "The current password is incorrect.");
  }
  if (input.newPassword.length < 8) throw new BillingError(400, "INVALID", "Use a password of at least 8 characters.");
  if (await bcrypt.compare(input.newPassword, user.passwordHash)) throw new BillingError(400, "INVALID", "Choose a different password.");
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(input.newPassword, 10), mustChangePassword: false, sessionVersion: { increment: 1 } },
    select: { id: true, email: true, displayName: true, role: true, sessionVersion: true, mustChangePassword: true },
  });
  await prisma.auditLog.create({
    data: { actorId: userId, action: "user.password_changed", targetType: "User", targetId: userId, metadata: {} },
  });
  return updated;
}

export async function redeemActivationToken(input: { token: string; newPassword: string }) {
  const prisma = getPrisma();
  if (input.newPassword.length < 8) throw new BillingError(400, "INVALID", "Use a password of at least 8 characters.");
  const row = await prisma.passwordActivationToken.findUnique({ where: { tokenHash: hashSecret(input.token) } });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) throw new BillingError(400, "INVALID_TOKEN", "This link is invalid or has expired.");
  const updated = await prisma.user.update({
    where: { id: row.userId },
    data: { passwordHash: await bcrypt.hash(input.newPassword, 10), mustChangePassword: false, sessionVersion: { increment: 1 } },
    select: { id: true, email: true, displayName: true, role: true, sessionVersion: true, mustChangePassword: true },
  });
  await prisma.passwordActivationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  await prisma.auditLog.create({
    data: { actorId: updated.id, action: "user.activation_redeemed", targetType: "User", targetId: updated.id, metadata: { purpose: row.purpose } },
  });
  return updated;
}

async function seatState(gymId: string) {
  const prisma = getPrisma();
  const [allocation, occupied, pendingInvites] = await Promise.all([
    prisma.seatAllocation.findUnique({ where: { gymId } }),
    prisma.gymMembership.count({ where: { gymId, role: "MEMBER", status: "ACTIVE" } }),
    prisma.invitation.count({ where: { gymId, status: "PENDING", expiresAt: { gt: new Date() } } }),
  ]);
  return { seatLimit: allocation?.seatLimit ?? null, occupied, pendingInvites };
}

export async function listGymBilling() {
  const gyms = await getPrisma().gym.findMany({
    include: {
      owner: { select: { id: true, email: true, displayName: true } },
      seatAllocation: true,
      subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } },
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const occupied = await getPrisma().gymMembership.groupBy({ by: ["gymId"], where: { role: "MEMBER", status: "ACTIVE" }, _count: { _all: true } });
  const occupiedByGym = new Map(occupied.map((row) => [row.gymId, row._count._all]));
  return gyms.map((gym) => ({
    id: gym.id,
    name: gym.name,
    slug: gym.slug,
    subscriptionStatus: gym.subscriptionStatus,
    owner: gym.owner,
    seatLimit: gym.seatAllocation?.seatLimit ?? null,
    occupiedSeats: occupiedByGym.get(gym.id) ?? 0,
    members: gym._count.memberships,
    latestSubscription: gym.subscriptions[0]
      ? {
          id: gym.subscriptions[0].id,
          status: gym.subscriptions[0].status,
          amountInr: gym.subscriptions[0].amountInr,
          startsAt: gym.subscriptions[0].startsAt.toISOString(),
          endsAt: gym.subscriptions[0].endsAt.toISOString(),
          plan: gym.subscriptions[0].plan.code,
        }
      : null,
  }));
}

export async function createGymAccount(
  actor: { id: string; role: string },
  input: { name: string; ownerEmail: string; ownerName: string; seatLimit: number; planCode?: string; phone?: string },
) {
  const prisma = getPrisma();
  const planCode = input.planCode ?? "gym_starter";
  const seats = seatLimitForPlan(planCode, input.seatLimit);
  if (!seats.ok) throw new BillingError(400, "INVALID", seats.message);
  const plan = await prisma.plan.findUnique({ where: { code: planCode } });
  if (!plan || plan.kind !== "GYM") throw new BillingError(400, "INVALID", "Choose a gym plan.");
  const email = input.ownerEmail.toLowerCase();
  let owner = await prisma.user.findUnique({ where: { email }, select: userSelect });
  let delivery: { temporaryPassword: string } | null = null;
  if (!owner) {
    const created = await createProvisionedUser(actor, { email, displayName: input.ownerName, role: "GYM_OWNER", phone: input.phone });
    owner = await prisma.user.findUniqueOrThrow({ where: { id: created.user.id }, select: userSelect });
    delivery = created.delivery;
  } else if (owner.role !== "GYM_OWNER" && owner.role !== "ADMIN" && owner.role !== "SUPER_ADMIN") {
    throw new BillingError(409, "ROLE", "That email already belongs to another kind of account.");
  }
  const gym = await prisma.gym.create({
    data: {
      name: input.name,
      slug: slugify(input.name),
      ownerId: owner.id,
      subscriptionStatus: "TRIALING",
      branding: { tagline: input.name, accent: "#BEFF39", logoText: input.name.slice(0, 2).toUpperCase() },
      memberships: { create: { userId: owner.id, role: "OWNER" } },
      seatAllocation: { create: { seatLimit: seats.seatLimit } },
    },
  });
  await persistAudit(adminAudit(actor.role, actor.id, "gym.create", "Gym", gym.id, { seatLimit: seats.seatLimit, ownerId: owner.id, planCode }));
  return { gymId: gym.id, slug: gym.slug, ownerId: owner.id, delivery };
}

export async function setSeatLimit(actor: { id: string; role: string }, gymId: string, seatLimit: number, planCode?: string) {
  const prisma = getPrisma();
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, include: { seatAllocation: true, subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } } } });
  if (!gym) throw new BillingError(404, "NOT_FOUND", "Gym not found.");
  const code = planCode ?? gym.subscriptions[0]?.plan.code ?? "gym_starter";
  const seats = seatLimitForPlan(code, seatLimit);
  if (!seats.ok) throw new BillingError(400, "INVALID", seats.message);
  const occupied = await prisma.gymMembership.count({ where: { gymId, role: "MEMBER", status: "ACTIVE" } });
  if (occupied > seats.seatLimit) throw new BillingError(409, "SEATS", "Occupied member seats are already above that limit.");
  await prisma.seatAllocation.upsert({
    where: { gymId },
    update: { seatLimit: seats.seatLimit },
    create: { gymId, seatLimit: seats.seatLimit },
  });
  await persistAudit(adminAudit(actor.role, actor.id, "gym.seats", "Gym", gymId, { seatLimit: seats.seatLimit }));
  return { seatLimit: seats.seatLimit, occupied };
}

async function syncGymFlag(gymId: string, status: SubscriptionRecordStatus) {
  const flag = status === "ACTIVE" ? "ACTIVE" : status === "PENDING" ? "TRIALING" : "EXPIRED";
  await getPrisma().gym.update({ where: { id: gymId }, data: { subscriptionStatus: flag } });
}

export async function createSubscription(
  actor: { id: string; role: string },
  input: {
    planCode: string;
    userId?: string;
    gymId?: string;
    status: SubscriptionRecordStatus;
    billingPeriod: "NONE" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
    amountInr: number;
    discountInr: number;
    startsAt: Date;
    endsAt: Date;
    notes: string;
    seatLimit?: number;
  },
) {
  const prisma = getPrisma();
  if ((input.userId ? 1 : 0) + (input.gymId ? 1 : 0) !== 1) throw new BillingError(400, "INVALID", "Attach the subscription to one user or one gym.");
  if (!Number.isInteger(input.amountInr) || input.amountInr < 0 || !Number.isInteger(input.discountInr) || input.discountInr < 0) {
    throw new BillingError(400, "INVALID", "Amount and discount must be whole rupees, zero or more.");
  }
  if (input.endsAt.getTime() <= input.startsAt.getTime()) throw new BillingError(400, "INVALID", "The end date must be after the start date.");
  if (input.status === "ACTIVE" && input.endsAt.getTime() <= Date.now()) {
    throw new BillingError(400, "INVALID", "Set an end date in the future before activating. Activation is what turns play back on.");
  }
  const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
  if (!plan) throw new BillingError(400, "INVALID", "Unknown plan.");
  if (input.userId && plan.kind !== "INDIVIDUAL") throw new BillingError(400, "INVALID", "That plan is not an individual plan.");
  if (input.gymId && plan.kind !== "GYM") throw new BillingError(400, "INVALID", "That plan is not a gym plan.");
  if (input.userId && !(await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } }))) throw new BillingError(404, "NOT_FOUND", "User not found.");
  if (input.gymId && !(await prisma.gym.findUnique({ where: { id: input.gymId }, select: { id: true } }))) throw new BillingError(404, "NOT_FOUND", "Gym not found.");
  if (input.gymId && input.seatLimit) {
    const seats = seatLimitForPlan(plan.code, input.seatLimit);
    if (!seats.ok) throw new BillingError(400, "INVALID", seats.message);
  }
  const created = await prisma.subscription.create({
    data: {
      userId: input.userId ?? null,
      gymId: input.gymId ?? null,
      planId: plan.id,
      status: input.status,
      billingPeriod: input.billingPeriod,
      amountInr: input.amountInr,
      discountInr: input.discountInr,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      notes: input.notes,
      createdById: actor.id,
      updatedById: actor.id,
      events: {
        create: {
          action: input.status === "ACTIVE" ? "ACTIVATED" : "CREATED",
          toStatus: input.status,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          amountInr: input.amountInr,
          note: input.notes,
          actorId: actor.id,
        },
      },
    },
  });
  if (input.gymId) {
    await syncGymFlag(input.gymId, input.status);
    if (input.seatLimit) {
      const seats = seatLimitForPlan(plan.code, input.seatLimit);
      if (seats.ok) {
        await prisma.seatAllocation.upsert({
          where: { gymId: input.gymId },
          update: { seatLimit: seats.seatLimit, subscriptionId: created.id },
          create: { gymId: input.gymId, seatLimit: seats.seatLimit, subscriptionId: created.id },
        });
      }
    }
  }
  await persistAudit(adminAudit(actor.role, actor.id, input.status === "ACTIVE" ? "subscription.activate" : "subscription.create", "Subscription", created.id, { planCode: plan.code, amountInr: input.amountInr, status: input.status }));
  return { id: created.id };
}

export async function updateSubscription(
  actor: { id: string; role: string },
  id: string,
  input: {
    status?: SubscriptionRecordStatus;
    endsAt?: Date;
    startsAt?: Date;
    amountInr?: number;
    discountInr?: number;
    notes?: string;
    billingPeriod?: "NONE" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
    planCode?: string;
    seatLimit?: number;
    eventAction?: string;
    eventNote?: string;
  },
) {
  const prisma = getPrisma();
  const current = await prisma.subscription.findUnique({ where: { id }, include: { plan: true } });
  if (!current) throw new BillingError(404, "NOT_FOUND", "Subscription not found.");
  const endsAt = input.endsAt ?? current.endsAt;
  const startsAt = input.startsAt ?? current.startsAt;
  if (endsAt.getTime() <= startsAt.getTime()) throw new BillingError(400, "INVALID", "The end date must be after the start date.");
  const status = input.status ?? current.status;
  if (status === "ACTIVE" && endsAt.getTime() <= Date.now()) {
    throw new BillingError(400, "INVALID", "Set an end date in the future before activating. Activation is what turns play back on.");
  }
  let planId = current.planId;
  let planCode = current.plan.code;
  if (input.planCode) {
    const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan) throw new BillingError(400, "INVALID", "Unknown plan.");
    if (current.userId && plan.kind !== "INDIVIDUAL") throw new BillingError(400, "INVALID", "That plan is not a player plan.");
    if (current.gymId && plan.kind !== "GYM") throw new BillingError(400, "INVALID", "That plan is not a gym plan.");
    planId = plan.id;
    planCode = plan.code;
  }
  if (current.gymId && input.seatLimit) {
    const seats = seatLimitForPlan(planCode, input.seatLimit);
    if (!seats.ok) throw new BillingError(400, "INVALID", seats.message);
    const occupied = await prisma.gymMembership.count({ where: { gymId: current.gymId, role: "MEMBER", status: "ACTIVE" } });
    if (occupied > seats.seatLimit) throw new BillingError(409, "SEATS", "Occupied member seats are already above that limit.");
    await prisma.seatAllocation.upsert({
      where: { gymId: current.gymId },
      update: { seatLimit: seats.seatLimit, subscriptionId: current.id },
      create: { gymId: current.gymId, seatLimit: seats.seatLimit, subscriptionId: current.id },
    });
  }
  const eventAction = input.eventAction ?? (status === current.status ? (input.endsAt && input.endsAt.getTime() !== current.endsAt.getTime() ? "EXTENDED" : "UPDATED") : status === "ACTIVE" ? "ACTIVATED" : status === "SUSPENDED" ? "SUSPENDED" : status === "EXPIRED" ? "EXPIRED" : status === "CANCELLED" ? "CANCELLED" : "UPDATED");
  const updated = await prisma.subscription.update({
    where: { id },
    data: {
      planId,
      status,
      endsAt,
      startsAt,
      amountInr: input.amountInr ?? current.amountInr,
      discountInr: input.discountInr ?? current.discountInr,
      notes: input.notes ?? current.notes,
      billingPeriod: input.billingPeriod ?? current.billingPeriod,
      updatedById: actor.id,
      events: {
        create: {
          action: eventAction,
          fromStatus: current.status,
          toStatus: status,
          startsAt,
          endsAt,
          amountInr: input.amountInr ?? current.amountInr,
          note: input.eventNote ?? input.notes ?? "",
          actorId: actor.id,
        },
      },
    },
  });
  if (current.gymId) await syncGymFlag(current.gymId, status);
  const action = status === "ACTIVE" && current.status !== "ACTIVE" ? "subscription.activate" : status === "EXPIRED" ? "subscription.expire" : status === "SUSPENDED" ? "subscription.suspend" : "subscription.update";
  await persistAudit(adminAudit(actor.role, actor.id, action, "Subscription", id, { status }));
  return { id: updated.id, status: updated.status };
}

export async function listSubscriptions() {
  const rows = await getPrisma().subscription.findMany({
    include: {
      plan: true,
      user: { select: { id: true, email: true, displayName: true } },
      gym: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, displayName: true } },
      updatedBy: { select: { id: true, displayName: true } },
      payments: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 20, include: { actor: { select: { displayName: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    account: row.user ? { type: "user" as const, id: row.user.id, name: row.user.displayName, email: row.user.email } : { type: "gym" as const, id: row.gym?.id, name: row.gym?.name },
    plan: row.plan.code,
    planName: row.plan.name,
    status: row.status,
    billingPeriod: row.billingPeriod,
    amountInr: row.amountInr,
    discountInr: row.discountInr,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    notes: row.notes,
    createdBy: row.createdBy.displayName,
    updatedBy: row.updatedBy.displayName,
    payments: row.payments.map((payment) => ({
      id: payment.id,
      amountInr: payment.amountInr,
      status: payment.status,
      method: payment.method,
      paidAt: payment.paidAt.toISOString(),
      transactionRef: payment.transactionRef,
      invoiceRef: payment.invoiceRef,
    })),
    history: row.events.map((event) => ({
      id: event.id,
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      actor: event.actor.displayName,
      createdAt: event.createdAt.toISOString(),
      endsAt: event.endsAt?.toISOString() ?? null,
    })),
  }));
}

export async function listPayments() {
  const rows = await getPrisma().payment.findMany({
    include: {
      subscription: {
        select: {
          id: true,
          plan: { select: { name: true } },
          user: { select: { displayName: true, phone: true } },
          gym: { select: { name: true, owner: { select: { phone: true } } } },
        },
      },
      recordedBy: { select: { displayName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    subscriptionId: row.subscriptionId,
    account: row.subscription.user?.displayName ?? row.subscription.gym?.name ?? "Account",
    phone: row.subscription.user?.phone ?? row.subscription.gym?.owner.phone ?? null,
    planName: row.subscription.plan.name,
    amountInr: row.amountInr,
    paidAt: row.paidAt.toISOString(),
    method: row.method,
    transactionRef: row.transactionRef,
    invoiceRef: row.invoiceRef,
    status: row.status,
    notes: row.notes,
    recordedBy: row.recordedBy.displayName,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function recordPayment(
  actor: { id: string; role: string },
  input: { subscriptionId: string; amountInr: number; paidAt: Date; method: "CASH" | "BANK_TRANSFER" | "UPI" | "CARD" | "OTHER"; transactionRef: string; invoiceRef: string; status: "PAID" | "PENDING" | "PARTIAL" | "REFUNDED"; notes: string },
) {
  const prisma = getPrisma();
  if (!Number.isInteger(input.amountInr) || input.amountInr < 0) throw new BillingError(400, "INVALID", "Enter a whole rupee amount.");
  const subscription = await prisma.subscription.findUnique({ where: { id: input.subscriptionId }, select: { id: true } });
  if (!subscription) throw new BillingError(404, "NOT_FOUND", "Subscription not found.");
  const journal = applyAdminCommand(
    { audits: [], payments: [] },
    {
      role: actor.role,
      actorId: actor.id,
      action: "payment.record",
      targetType: "Payment",
      targetId: input.subscriptionId,
      metadata: { amountInr: input.amountInr, status: input.status, method: input.method },
      payment: { subscriptionId: input.subscriptionId, amountInr: input.amountInr, status: input.status },
    },
  );
  const payment = await prisma.payment.create({
    data: {
      subscriptionId: input.subscriptionId,
      amountInr: input.amountInr,
      paidAt: input.paidAt,
      method: input.method,
      transactionRef: input.transactionRef,
      invoiceRef: input.invoiceRef,
      status: input.status,
      notes: input.notes,
      recordedById: actor.id,
    },
  });
  const audit = journal.audits[0];
  if (!audit) throw new BillingError(500, "AUDIT", "The payment did not produce an audit row.");
  await persistAudit({ ...audit, targetId: payment.id });
  return { id: payment.id };
}

export async function setLegacyGymStatus(actor: { id: string; role: string }, gymId: string, subscriptionStatus: "ACTIVE" | "TRIALING" | "EXPIRED") {
  const prisma = getPrisma();
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) throw new BillingError(404, "NOT_FOUND", "Gym not found.");
  const mapped: SubscriptionRecordStatus = subscriptionStatus === "ACTIVE" ? "ACTIVE" : subscriptionStatus === "EXPIRED" ? "EXPIRED" : "SUSPENDED";
  if (subscriptionStatus === "ACTIVE") {
    const latest = await prisma.subscription.findFirst({ where: { gymId }, orderBy: { createdAt: "desc" } });
    if (latest && latest.endsAt.getTime() <= Date.now()) {
      throw new BillingError(400, "INVALID", "Set an end date in the future before activating this gym.");
    }
  }
  await prisma.gym.update({ where: { id: gymId }, data: { subscriptionStatus } });
  if (subscriptionStatus !== "TRIALING") {
    await prisma.subscription.updateMany({ where: { gymId, status: "ACTIVE" }, data: { status: mapped, updatedById: actor.id } });
  } else {
    await prisma.subscription.updateMany({ where: { gymId, status: "ACTIVE" }, data: { status: "SUSPENDED", updatedById: actor.id } });
  }
  await persistAudit(adminAudit(actor.role, actor.id, "gym.subscription_flag", "Gym", gymId, { subscriptionStatus }));
}

export async function provisionGymMember(actor: { id: string; role: string }, gymId: string, input: { email: string; displayName: string }) {
  const prisma = getPrisma();
  const gym = await prisma.gym.findUnique({ where: { id: gymId }, select: { id: true } });
  if (!gym) throw new BillingError(404, "NOT_FOUND", "Gym not found.");
  const seats = await seatState(gymId);
  const gate = canInvite({ actorRole: actor.role, actorGymIds: [gymId], gymId, ...seats });
  if (!gate.ok) throw new BillingError(409, "SEATS", gate.reason === "no_allocation" ? "Allocate seats before adding a member." : "No member seats are available.");
  const email = input.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email }, select: userSelect });
  let delivery: { temporaryPassword: string } | null = null;
  if (!user) {
    const created = await createProvisionedUser(actor, { email, displayName: input.displayName, role: "INDIVIDUAL" });
    user = await prisma.user.findUniqueOrThrow({ where: { id: created.user.id }, select: userSelect });
    delivery = created.delivery;
  }
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") throw new BillingError(409, "ROLE", "That account cannot be added as a gym member.");
  await linkPlayerToGym({ userId: user.id, gymId, assignedBy: actor.id });
  await persistAudit(adminAudit(actor.role, actor.id, "gym.member", "Gym", gymId, { userId: user.id }));
  return { userId: user.id, delivery };
}

export async function gymInviteState(userId: string) {
  const gym = await getPrisma().gym.findFirst({
    where: { OR: [{ ownerId: userId }, { memberships: { some: { userId, role: "OWNER", status: "ACTIVE" } } }] },
    select: { id: true, name: true, ownerId: true, subscriptionStatus: true },
  });
  if (!gym || gym.ownerId !== userId) return null;
  const seats = await seatState(gym.id);
  const invitations = await getPrisma().invitation.findMany({
    where: { gymId: gym.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, email: true, status: true, expiresAt: true, createdAt: true },
  });
  return {
    gymId: gym.id,
    gymName: gym.name,
    subscriptionStatus: gym.subscriptionStatus,
    ...seats,
    available: seats.seatLimit === null ? 0 : seats.seatLimit - seats.occupied - seats.pendingInvites,
    invitations: invitations.map((invite) => ({ ...invite, expiresAt: invite.expiresAt.toISOString(), createdAt: invite.createdAt.toISOString() })),
  };
}

export async function createOwnerInvitation(actor: { id: string; role: string }, emailRaw: string) {
  const state = await gymInviteState(actor.id);
  if (!state) throw new BillingError(403, "FORBIDDEN", "Only the gym owner can invite members.");
  const gate = canInvite({
    actorRole: "GYM_OWNER",
    actorGymIds: [state.gymId],
    gymId: state.gymId,
    seatLimit: state.seatLimit,
    occupied: state.occupied,
    pendingInvites: state.pendingInvites,
  });
  if (!gate.ok) {
    throw new BillingError(409, "SEATS", gate.reason === "no_seats" ? "Every allocated seat is already used or reserved." : "No seats have been allocated for this gym.");
  }
  const email = emailRaw.toLowerCase();
  const token = newToken();
  const invite = await getPrisma().invitation.create({
    data: {
      gymId: state.gymId,
      email,
      tokenHash: hashSecret(token),
      invitedById: actor.id,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
  });
  await getPrisma().auditLog.create({
    data: { actorId: actor.id, action: "invitation.create", targetType: "Invitation", targetId: invite.id, metadata: { gymId: state.gymId, email } },
  });
  return { id: invite.id, delivery: { activationPath: `/invite?token=${encodeURIComponent(token)}` } };
}

export async function acceptInvitation(user: { id: string; email: string; role: string }, token: string) {
  const prisma = getPrisma();
  const invite = await prisma.invitation.findUnique({ where: { tokenHash: hashSecret(token) }, include: { gym: true } });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt.getTime() <= Date.now()) {
    throw new BillingError(400, "INVALID_TOKEN", "This invitation is invalid or has expired.");
  }
  if (!user.email || user.email.toLowerCase() !== invite.email) {
    throw new BillingError(403, "FORBIDDEN", "Sign in with the invited email. This invite does not create an account.");
  }
  const seats = await seatState(invite.gymId);
  const pendingOthers = Math.max(0, seats.pendingInvites - 1);
  if (seats.seatLimit === null || seats.seatLimit - seats.occupied - pendingOthers < 1) {
    throw new BillingError(409, "SEATS", "No member seat is free for this invitation.");
  }
  await linkPlayerToGym({ userId: user.id, gymId: invite.gymId, assignedBy: invite.invitedById, pendingAdjust: -1 });
  await prisma.invitation.update({ where: { id: invite.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
  return { gymId: invite.gymId, gymName: invite.gym.name, playGranted: invite.gym.subscriptionStatus === "ACTIVE" };
}

export async function listAudit(limit = 50) {
  const rows = await getPrisma().auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { displayName: true, email: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata,
    actor: row.actor?.displayName ?? "System",
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function auditAdminAction(actor: { id: string; role: string }, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
  await persistAudit(adminAudit(actor.role, actor.id, action, targetType, targetId, metadata));
}

export async function memberSeatAvailable(gymId: string) {
  const seats = await seatState(gymId);
  return canInvite({ actorRole: "SUPER_ADMIN", actorGymIds: [gymId], gymId, ...seats });
}
