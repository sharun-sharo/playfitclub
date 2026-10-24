import { getPrisma } from "../client";
import { BillingError } from "./errors";
import {
  chooseAccount,
  daysRemaining,
  defaultSeatLimit,
  deskStatusLabel,
  EXPIRING_SOON_DAYS,
  extensionSchedule,
  formatPhone,
  isDeskExpired,
  isExpiringSoon,
  isInForce,
  isPaymentPending,
  listedPlan,
  normalizePhone,
  parseDeskDay,
  periodAmountPending,
  planCustomerType,
  renewalSchedule,
  seatLimitForPlan,
  subscriptionQuote,
  type BillingTerm,
  type DeskPaymentStatus,
  type SubStatus,
} from "./policy";
import {
  auditAdminAction,
  createGymAccount,
  createProvisionedUser,
  createSubscription,
  recordPayment,
  updateSubscription,
} from "./service";

const DAY_MS = 24 * 60 * 60 * 1000;
const LEDGER_NOTE = "Admin ledger entry. No card or payment provider was charged.";

const ACTION_LABELS: Record<string, string> = {
  CREATED: "Created",
  ACTIVATED: "Activated",
  EXTENDED: "Extended",
  RENEWED: "Renewed",
  UPDATED: "Updated",
  SUSPENDED: "Suspended",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

const METHOD_LABELS: Record<string, string> = {
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer",
  CASH: "Cash",
  CARD: "Card",
  OTHER: "Other",
};

const PAYMENT_LABELS: Record<string, string> = {
  PAID: "Paid",
  PENDING: "Payment pending",
  PARTIAL: "Partial",
  REFUNDED: "Refunded",
};

export interface DeskMatch {
  id: string;
  kind: "player" | "gym";
  name: string;
  phoneLabel: string;
  detail: string;
  usable: boolean;
}

export interface DeskChoice {
  outcome: "invalid" | "use" | "choose" | "create";
  message: string;
  canCreate: boolean;
  matches: DeskMatch[];
  resolvedId?: string;
  resolvedKind?: "player" | "gym";
}

export type DeskFilter = "all" | "active" | "expiring" | "expired" | "payment_pending";

export interface DeskSubscription {
  id: string;
  name: string;
  phoneLabel: string;
  customerType: "Player" | "Gym";
  planName: string;
  expiryLabel: string;
  statusLabel: string;
  paymentLabel: string;
  startsLabel: string;
  remainingLabel: string;
  amountLabel: string;
  paidLabel: string;
  pendingLabel: string;
  amountInr: number;
  amountPaidInr: number;
  amountPendingInr: number;
  inForce: boolean;
  expiring: boolean;
  expired: boolean;
  paymentPending: boolean;
  gym: null | {
    name: string;
    ownerName: string;
    capacity: number | null;
    assignedPlayers: Array<{ name: string; phoneLabel: string }>;
    availableSeats: number | null;
  };
  history: Array<{ action: string; actor: string; when: string; note: string }>;
  payments: Array<{ amountLabel: string; status: string; method: string; when: string; note: string }>;
}

function formatDeskDate(ms: number) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));
}

function formatInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function cleanName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function provisionEmail(phone: string) {
  return `member.${phone.replace(/\D/g, "")}@accounts.fitplay.dev`;
}

function remainingLabel(endsAt: number, now: number, status: SubStatus) {
  if (status === "CANCELLED") return "Cancelled";
  if (endsAt <= now) {
    const ago = Math.floor((now - endsAt) / DAY_MS);
    if (ago <= 0) return "Ended today";
    return ago === 1 ? "Ended 1 day ago" : `Ended ${ago} days ago`;
  }
  const days = daysRemaining(endsAt, now);
  if (days <= 1) return "1 day remaining";
  return `${days} days remaining`;
}

function paymentWord(input: { amountInr: number; discountInr: number; paidInr: number; pendingInr: number }) {
  const due = Math.max(0, input.amountInr - input.discountInr);
  if (due === 0) return "Paid";
  if (input.paidInr <= 0) return "Payment pending";
  if (input.pendingInr > 0) return "Partial";
  return "Paid";
}

export function describeDeskQuote(
  quote: Extract<ReturnType<typeof subscriptionQuote>, { ok: true }>,
  now: number,
  receivedInr?: number,
) {
  const received = quote.paymentStatus === "PARTIAL" ? receivedInr ?? 0 : quote.paymentStatus === "PAID" ? quote.amountInr : 0;
  const pending = periodAmountPending({ amountInr: quote.amountInr, discountInr: 0, paidInr: received });
  return {
    planName: quote.planName,
    priceLabel: formatInr(quote.amountInr),
    startsOn: formatDeskDate(quote.startsAt),
    expiresOn: formatDeskDate(quote.endsAt),
    durationLabel: `${quote.durationDays} days`,
    seatText: quote.seatLimit === null ? null : `${quote.seatLimit} seats included${quote.seatLabel ? ` (${quote.seatLabel})` : ""}`,
    statusLabel: deskStatusLabel({ status: quote.status, endsAt: quote.endsAt, now, pendingInr: pending }),
    paymentLabel: quote.paymentStatus === "PAID" ? "Paid" : quote.paymentStatus === "PARTIAL" ? "Partial" : "Payment pending",
    pendingLabel: formatInr(pending),
  };
}

export function quoteDeskSubscription(input: {
  customerType: "player" | "gym";
  planCode: string;
  paymentStatus: DeskPaymentStatus;
  period?: BillingTerm;
  startsOn?: string;
  endsOn?: string;
  seatLimit?: number | null;
  receivedInr?: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const startsAt = input.startsOn ? parseDeskDay(input.startsOn) : null;
  const endsAt = input.endsOn ? parseDeskDay(input.endsOn) : null;
  if (input.startsOn && startsAt === null) return { ok: false as const, message: "Enter a valid start date." };
  if (input.endsOn && endsAt === null) return { ok: false as const, message: "Enter a valid expiry date." };
  const quote = subscriptionQuote({
    planCode: input.planCode,
    customerType: input.customerType,
    paymentStatus: input.paymentStatus,
    period: input.period,
    now,
    seatLimit: input.seatLimit,
    startsAt,
    endsAt,
  });
  if (!quote.ok) return quote;
  return { ok: true as const, quote, preview: describeDeskQuote(quote, now, input.receivedInr) };
}

async function usersMatching(name: string, phone: string | null) {
  const or: Array<Record<string, unknown>> = [];
  if (name) or.push({ displayName: { contains: name, mode: "insensitive" } });
  if (phone) or.push({ phone });
  if (or.length === 0) return [];
  return getPrisma().user.findMany({
    where: { OR: or },
    select: {
      id: true,
      displayName: true,
      phone: true,
      role: true,
      ownedGyms: { select: { id: true, name: true }, take: 1 },
    },
    take: 20,
    orderBy: { displayName: "asc" },
  });
}

async function gymsMatching(name: string, phone: string | null) {
  const or: Array<Record<string, unknown>> = [];
  if (name) {
    or.push({ name: { contains: name, mode: "insensitive" } });
    or.push({ owner: { displayName: { contains: name, mode: "insensitive" } } });
  }
  if (phone) or.push({ owner: { phone } });
  if (or.length === 0) return [];
  return getPrisma().gym.findMany({
    where: { OR: or },
    select: { id: true, name: true, owner: { select: { id: true, displayName: true, phone: true } } },
    take: 20,
    orderBy: { name: "asc" },
  });
}

function playerMatch(user: { id: string; displayName: string; phone: string | null; role: string; ownedGyms?: Array<{ name: string }> }, usable: boolean): DeskMatch {
  const ownerGym = user.ownedGyms?.[0]?.name;
  const detail = user.role === "GYM_OWNER" ? (ownerGym ? `Gym owner · ${ownerGym}` : "Gym owner") : user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? "Staff account" : "Player";
  return { id: user.id, kind: "player", name: user.displayName, phoneLabel: formatPhone(user.phone), detail, usable: usable && detail === "Player" };
}

function gymMatch(gym: { id: string; name: string; owner: { displayName: string; phone: string | null } }, usable = true): DeskMatch {
  return {
    id: gym.id,
    kind: "gym",
    name: gym.name,
    phoneLabel: formatPhone(gym.owner.phone),
    detail: `Gym · owner ${gym.owner.displayName}`,
    usable,
  };
}

export async function searchDeskCustomers(input: {
  customerType: "player" | "gym";
  name: string;
  phone: string;
  confirmedId?: string | null;
  createAccount?: boolean;
}): Promise<DeskChoice> {
  const name = cleanName(input.name);
  const phone = normalizePhone(input.phone);
  if (name.length < 2) return { outcome: "invalid", message: "Enter the customer name.", canCreate: false, matches: [] };
  if (!phone) return { outcome: "invalid", message: "Enter a mobile number, including +91.", canCreate: false, matches: [] };

  if (input.customerType === "player") return resolvePlayer({ name, phone, confirmedId: input.confirmedId, createAccount: input.createAccount });
  return resolveGym({ name, phone, confirmedId: input.confirmedId, createAccount: input.createAccount });
}

async function resolvePlayer(input: { name: string; phone: string; confirmedId?: string | null; createAccount?: boolean }): Promise<DeskChoice> {
  const users = await usersMatching(input.name, input.phone);
  const choice = chooseAccount({
    name: input.name,
    phone: input.phone,
    existing: users.map((user) => ({ id: user.id, name: user.displayName, phone: user.phone })),
    confirmedId: input.confirmedId,
    createAccount: input.createAccount,
  });
  if (choice.action === "invalid") return { outcome: "invalid", message: choice.message, canCreate: false, matches: [] };
  if (choice.action === "use") {
    const user = users.find((item) => item.id === choice.id) ?? (await getPrisma().user.findUnique({
      where: { id: choice.id },
      select: { id: true, displayName: true, phone: true, role: true, ownedGyms: { select: { id: true, name: true }, take: 1 } },
    }));
    if (!user) return { outcome: "invalid", message: "Choose one of the matching customers.", canCreate: false, matches: [] };
    const match = playerMatch(user, true);
    if (!match.usable) {
      const gym = user.ownedGyms?.[0];
      return {
        outcome: "choose",
        canCreate: false,
        message: gym ? `This phone belongs to the owner of ${gym.name}. Create a gym subscription for that gym.` : "This phone belongs to a staff or owner account. Create a gym subscription, or choose a player.",
        matches: gym ? [gymMatch({ id: gym.id, name: gym.name, owner: { displayName: user.displayName, phone: user.phone } })] : [match],
      };
    }
    return {
      outcome: "use",
      canCreate: false,
      message: `This is ${user.displayName}. The subscription will be added to this customer.`,
      matches: [match],
      resolvedId: user.id,
      resolvedKind: "player",
    };
  }
  if (choice.action === "choose") {
    const picked = new Map(choice.matches.map((match) => [match.id, match]));
    return {
      outcome: "choose",
      canCreate: choice.canCreate,
      message: choice.message,
      matches: users.filter((user) => picked.has(user.id)).map((user) => playerMatch(user, choice.canCreate || user.phone === input.phone || namesSame(user.displayName, input.name))),
    };
  }
  if (users.length > 0 && !input.createAccount) {
    return {
      outcome: "choose",
      canCreate: true,
      message: "These customers look similar. Choose one, or create a new account.",
      matches: users.map((user) => playerMatch(user, true)),
    };
  }
  return { outcome: "create", message: "No customer has this name and phone. You can create an account.", canCreate: true, matches: [] };
}

function namesSame(left: string, right: string) {
  return left.trim().replace(/\s+/g, " ").toLowerCase() === right.trim().replace(/\s+/g, " ").toLowerCase();
}

async function resolveGym(input: { name: string; phone: string; confirmedId?: string | null; createAccount?: boolean }): Promise<DeskChoice> {
  const gyms = await gymsMatching(input.name, input.phone);
  const choice = chooseAccount({
    name: input.name,
    phone: input.phone,
    existing: gyms.map((gym) => ({ id: gym.id, name: gym.name, phone: gym.owner.phone })),
    confirmedId: input.confirmedId,
    createAccount: input.createAccount,
  });
  if (choice.action === "invalid") return { outcome: "invalid", message: choice.message, canCreate: false, matches: [] };
  if (choice.action === "use") {
    const gym = gyms.find((item) => item.id === choice.id) ?? (await getPrisma().gym.findUnique({
      where: { id: choice.id },
      select: { id: true, name: true, owner: { select: { id: true, displayName: true, phone: true } } },
    }));
    if (!gym) return { outcome: "invalid", message: "Choose one of the matching gyms.", canCreate: false, matches: [] };
    return {
      outcome: "use",
      canCreate: false,
      message: `This is ${gym.name}. The subscription will be added to this gym.`,
      matches: [gymMatch(gym)],
      resolvedId: gym.id,
      resolvedKind: "gym",
    };
  }
  if (choice.action === "choose") {
    const ids = new Set(choice.matches.map((match) => match.id));
    return {
      outcome: "choose",
      canCreate: choice.canCreate,
      message: choice.message,
      matches: gyms.filter((gym) => ids.has(gym.id)).map((gym) => gymMatch(gym)),
    };
  }
  const phoneUsers = await usersMatching("", input.phone);
  if (phoneUsers.length > 0) {
    const owned = phoneUsers.flatMap((user) => user.ownedGyms.map((gym) => gymMatch({ id: gym.id, name: gym.name, owner: { displayName: user.displayName, phone: user.phone } })));
    if (owned.length > 0) {
      return {
        outcome: "choose",
        canCreate: false,
        message: "This phone already belongs to a gym owner. Choose that gym. A second account is not created for the same phone.",
        matches: owned,
      };
    }
    return {
      outcome: "choose",
      canCreate: false,
      message: `This phone belongs to ${phoneUsers.map((user) => user.displayName).join(", ")}. Choose that person for a player subscription, or enter a different phone. A second account is not created for the same phone.`,
      matches: phoneUsers.map((user) => playerMatch(user, false)),
    };
  }
  if (gyms.length > 0 && !input.createAccount) {
    return {
      outcome: "choose",
      canCreate: true,
      message: "These gyms look similar. Choose one, or create a new gym.",
      matches: gyms.map((gym) => gymMatch(gym)),
    };
  }
  return { outcome: "create", message: "No gym has this name and phone. You can create the gym and an owner account.", canCreate: true, matches: [] };
}

async function attachPhoneIfBlank(userId: string, phone: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (!user || user.phone) return;
  const taken = await prisma.user.count({ where: { phone, NOT: { id: userId } } });
  if (taken > 0) return;
  await prisma.user.update({ where: { id: userId }, data: { phone } });
}

async function latestOpen(where: { userId: string } | { gymId: string }) {
  return getPrisma().subscription.findFirst({
    where: { ...where, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
}

function assertPartial(quoteAmount: number, paymentStatus: DeskPaymentStatus, receivedInr?: number) {
  if (quoteAmount === 0 && paymentStatus !== "PAID") {
    throw new BillingError(400, "INVALID", "Free demo is ₹0. Mark it paid.");
  }
  if (paymentStatus !== "PARTIAL") return quoteAmount;
  if (receivedInr === undefined || !Number.isInteger(receivedInr) || receivedInr <= 0 || receivedInr >= quoteAmount) {
    throw new BillingError(400, "INVALID", "Enter the amount received, less than the plan price. Mark it paid if the full price was received.");
  }
  return receivedInr;
}

export async function createDeskSubscription(
  actor: { id: string; role: string },
  input: {
    customerType: "player" | "gym";
    name: string;
    phone: string;
    planCode: string;
    paymentStatus: DeskPaymentStatus;
    period?: BillingTerm;
    startsOn?: string;
    endsOn?: string;
    seatLimit?: number | null;
    receivedInr?: number;
    confirmedId?: string | null;
    createAccount?: boolean;
  },
) {
  const choice = await searchDeskCustomers(input);
  if (choice.outcome === "invalid" || choice.outcome === "choose") {
    return { ok: false as const, needsChoice: true, alreadyOpen: false, message: choice.message, canCreate: choice.canCreate, matches: choice.matches };
  }
  if (choice.outcome === "create" && !input.createAccount) {
    return { ok: false as const, needsChoice: true, alreadyOpen: false, message: choice.message, canCreate: true, matches: [] };
  }
  const quoted = quoteDeskSubscription(input);
  if (!quoted.ok) throw new BillingError(400, "INVALID", quoted.message);
  const recordedAmount = assertPartial(quoted.quote.amountInr, input.paymentStatus, input.receivedInr);
  const phone = normalizePhone(input.phone);
  if (!phone) throw new BillingError(400, "INVALID", "Enter a mobile number, including +91.");
  const name = cleanName(input.name);

  let userId: string | undefined;
  let gymId: string | undefined;
  let delivery: { temporaryPassword?: string; signInEmail?: string } | null = null;

  if (input.customerType === "player") {
    if (choice.outcome === "use" && choice.resolvedId) {
      const open = await latestOpen({ userId: choice.resolvedId });
      if (open) return { ok: false as const, needsChoice: false, alreadyOpen: true, subscriptionId: open.id, message: `${name} already has a subscription. Open it to renew, change the plan, or record a payment.`, canCreate: false, matches: choice.matches };
      userId = choice.resolvedId;
      await attachPhoneIfBlank(userId, phone);
    } else {
      const created = await createProvisionedUser(actor, { email: provisionEmail(phone), displayName: name, role: "INDIVIDUAL", phone });
      userId = created.user.id;
      delivery = { temporaryPassword: created.delivery.temporaryPassword, signInEmail: provisionEmail(phone) };
    }
  } else if (choice.outcome === "use" && choice.resolvedId) {
    const open = await latestOpen({ gymId: choice.resolvedId });
    if (open) return { ok: false as const, needsChoice: false, alreadyOpen: true, subscriptionId: open.id, message: `${name} already has a subscription. Open it to renew, change the plan, or record a payment.`, canCreate: false, matches: choice.matches };
    gymId = choice.resolvedId;
    const gym = await getPrisma().gym.findUnique({ where: { id: gymId }, select: { ownerId: true } });
    if (gym) await attachPhoneIfBlank(gym.ownerId, phone);
  } else {
    const seatLimit = quoted.quote.seatLimit ?? defaultSeatLimit(input.planCode);
    if (!seatLimit) throw new BillingError(400, "INVALID", "Choose a seat limit for this gym plan.");
    const created = await createGymAccount(actor, {
      name,
      ownerEmail: provisionEmail(phone),
      ownerName: name,
      seatLimit,
      planCode: input.planCode,
      phone,
    });
    gymId = created.gymId;
    delivery = created.delivery ? { temporaryPassword: created.delivery.temporaryPassword, signInEmail: provisionEmail(phone) } : null;
  }

  const created = await createSubscription(actor, {
    planCode: quoted.quote.planCode,
    userId,
    gymId,
    status: quoted.quote.status,
    billingPeriod: quoted.quote.billingPeriod,
    amountInr: quoted.quote.amountInr,
    discountInr: quoted.quote.discountInr,
    startsAt: new Date(quoted.quote.startsAt),
    endsAt: new Date(quoted.quote.endsAt),
    notes: "",
    seatLimit: quoted.quote.seatLimit ?? undefined,
  });
  await recordPayment(actor, {
    subscriptionId: created.id,
    amountInr: recordedAmount,
    paidAt: new Date(),
    method: "OTHER",
    transactionRef: "",
    invoiceRef: "",
    status: input.paymentStatus,
    notes: LEDGER_NOTE,
  });
  return { ok: true as const, id: created.id, delivery, message: delivery ? `Account created for ${name}. Copy the temporary password now. It is not emailed.` : `Subscription saved for ${name}.` };
}

function paidTowardCurrentPeriod(
  payments: Array<{ status: string; amountInr: number; createdAt: Date }>,
  events: Array<{ action: string; createdAt: Date }>,
) {
  const renewal = events.find((event) => event.action === "RENEWED");
  const marker = renewal?.createdAt.getTime() ?? null;
  return payments
    .filter((payment) => (payment.status === "PAID" || payment.status === "PARTIAL") && (marker === null || payment.createdAt.getTime() >= marker))
    .reduce((sum, payment) => sum + payment.amountInr, 0);
}

export async function listSubscriptionDesk(input: { q?: string; filter?: string }) {
  const prisma = getPrisma();
  const now = Date.now();
  const nowDate = new Date(now);
  const [rows, revenue, invites] = await Promise.all([
    prisma.subscription.findMany({
      include: {
        plan: true,
        user: { select: { displayName: true, phone: true } },
        gym: { select: { id: true, name: true, owner: { select: { displayName: true, phone: true } }, seatAllocation: true } },
        payments: true,
        events: { orderBy: { createdAt: "desc" }, take: 20, include: { actor: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.payment.aggregate({ where: { status: { in: ["PAID", "PARTIAL"] } }, _sum: { amountInr: true } }),
    prisma.invitation.groupBy({ by: ["gymId"], where: { status: "PENDING", expiresAt: { gt: nowDate } }, _count: { _all: true } }),
  ]);
  const gymIds = rows.flatMap((row) => (row.gymId ? [row.gymId] : []));
  const members = gymIds.length
    ? await prisma.gymMembership.findMany({
        where: { gymId: { in: gymIds }, role: "MEMBER", status: "ACTIVE" },
        select: { gymId: true, user: { select: { displayName: true, phone: true } } },
        orderBy: { assignedAt: "desc" },
      })
    : [];
  const membersByGym = new Map<string, Array<{ name: string; phoneLabel: string }>>();
  for (const member of members) {
    const list = membersByGym.get(member.gymId) ?? [];
    list.push({ name: member.user.displayName, phoneLabel: formatPhone(member.user.phone) });
    membersByGym.set(member.gymId, list);
  }
  const invitesByGym = new Map(invites.map((row) => [row.gymId, row._count._all]));

  const subscriptions: DeskSubscription[] = rows.map((row) => {
    const paidInr = paidTowardCurrentPeriod(row.payments, row.events);
    const pendingInr = periodAmountPending({ amountInr: row.amountInr, discountInr: row.discountInr, paidInr });
    const endsAt = row.endsAt.getTime();
    const player = row.user;
    const gym = row.gym;
    const phone = player?.phone ?? gym?.owner.phone ?? null;
    const occupied = gym ? (membersByGym.get(gym.id)?.length ?? 0) : 0;
    const capacity = gym?.seatAllocation?.seatLimit ?? null;
    const pendingInvites = gym ? invitesByGym.get(gym.id) ?? 0 : 0;
    return {
      id: row.id,
      name: player?.displayName ?? gym?.name ?? "Customer",
      phoneLabel: formatPhone(phone),
      customerType: player ? "Player" : "Gym",
      planName: row.plan.name,
      expiryLabel: formatDeskDate(endsAt),
      statusLabel: deskStatusLabel({ status: row.status, endsAt, now, pendingInr }),
      paymentLabel: paymentWord({ amountInr: row.amountInr, discountInr: row.discountInr, paidInr, pendingInr }),
      startsLabel: formatDeskDate(row.startsAt.getTime()),
      remainingLabel: remainingLabel(endsAt, now, row.status),
      amountLabel: formatInr(row.amountInr),
      paidLabel: formatInr(paidInr),
      pendingLabel: formatInr(pendingInr),
      amountInr: row.amountInr,
      amountPaidInr: paidInr,
      amountPendingInr: pendingInr,
      inForce: isInForce(row.status, endsAt, now),
      expiring: isExpiringSoon(row.status, endsAt, now),
      expired: isDeskExpired(row.status, endsAt, now),
      paymentPending: isPaymentPending(row.status, pendingInr),
      gym: gym
        ? {
            name: gym.name,
            ownerName: gym.owner.displayName,
            capacity,
            assignedPlayers: membersByGym.get(gym.id) ?? [],
            availableSeats: capacity === null ? null : capacity - occupied - pendingInvites,
          }
        : null,
      history: row.events.map((event) => ({
        action: ACTION_LABELS[event.action] ?? "Updated",
        actor: event.actor.displayName,
        when: formatDeskDate(event.createdAt.getTime()),
        note: event.note,
      })),
      payments: [...row.payments]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((payment) => ({
          amountLabel: formatInr(payment.amountInr),
          status: PAYMENT_LABELS[payment.status] ?? payment.status,
          method: METHOD_LABELS[payment.method] ?? payment.method,
          when: formatDeskDate(payment.paidAt.getTime()),
          note: payment.notes,
        })),
    };
  });

  const filter = (["all", "active", "expiring", "expired", "payment_pending"] as const).includes(input.filter as DeskFilter) ? (input.filter as DeskFilter) : "all";
  const query = input.q?.trim().toLowerCase() ?? "";
  const digits = input.q?.replace(/\D/g, "") ?? "";
  const visible = subscriptions.filter((row) => {
    if (query) {
      const nameHit = row.name.toLowerCase().includes(query) || row.phoneLabel.toLowerCase().includes(query);
      const phoneHit = digits.length >= 3 && row.phoneLabel.replace(/\D/g, "").includes(digits);
      if (!nameHit && !phoneHit) return false;
    }
    if (filter === "active") return row.inForce;
    if (filter === "expiring") return row.expiring;
    if (filter === "expired") return row.expired;
    if (filter === "payment_pending") return row.paymentPending;
    return true;
  });

  return {
    expiringWithinDays: EXPIRING_SOON_DAYS,
    summary: {
      active: subscriptions.filter((row) => row.inForce).length,
      expiringSoon: subscriptions.filter((row) => row.expiring).length,
      expired: subscriptions.filter((row) => row.expired).length,
      paymentsPending: subscriptions.filter((row) => row.paymentPending).length,
      revenueCollectedInr: revenue._sum.amountInr ?? 0,
    },
    subscriptions: visible,
  };
}

async function loadSubscription(id: string) {
  const current = await getPrisma().subscription.findUnique({ where: { id }, include: { plan: true } });
  if (!current) throw new BillingError(404, "NOT_FOUND", "Subscription not found.");
  return current;
}

export async function previewDeskAction(id: string, input: { kind: "renew" | "extend" | "plan"; period?: BillingTerm; days?: number; planCode?: string }) {
  const current = await loadSubscription(id);
  const now = Date.now();
  if (input.kind === "renew") {
    const period = input.period ?? "YEARLY";
    const schedule = renewalSchedule({
      now,
      startsAt: current.startsAt.getTime(),
      endsAt: current.endsAt.getTime(),
      period,
      listPriceInr: current.plan.listPriceInr,
    });
    return {
      amountLabel: formatInr(schedule.amountInr),
      startsOn: formatDeskDate(schedule.startsAt),
      expiresOn: formatDeskDate(schedule.endsAt),
      durationLabel: `${schedule.durationDays} days`,
      note: "Listed plan price for the new period. Earlier payments stay in the history.",
    };
  }
  if (input.kind === "extend") {
    const schedule = extensionSchedule({ now, startsAt: current.startsAt.getTime(), endsAt: current.endsAt.getTime(), days: input.days ?? 0 });
    if (!schedule.ok) throw new BillingError(400, "INVALID", schedule.message);
    return {
      amountLabel: formatInr(current.amountInr),
      startsOn: formatDeskDate(schedule.startsAt),
      expiresOn: formatDeskDate(schedule.endsAt),
      durationLabel: `${input.days ?? 0} days added`,
      note: "The price stays the same. Earlier history stays.",
    };
  }
  const plan = input.planCode ? listedPlan(input.planCode) : null;
  if (!plan) throw new BillingError(400, "INVALID", "Choose a plan.");
  const customerType = current.userId ? "player" : "gym";
  if (planCustomerType(plan.code) !== customerType) throw new BillingError(400, "INVALID", customerType === "gym" ? "Choose a gym plan." : "Choose a player plan.");
  return {
    amountLabel: formatInr(plan.listPriceInr),
    startsOn: formatDeskDate(current.startsAt.getTime()),
    expiresOn: formatDeskDate(current.endsAt.getTime()),
    durationLabel: "Dates stay the same",
    note: planCustomerType(plan.code) === "gym" ? `${plan.name}. ${plan.code === "gym_starter" ? "Up to 49 seats." : "51–99 seats."}` : plan.name,
  };
}

export async function renewDeskSubscription(actor: { id: string; role: string }, id: string, input: { period: BillingTerm; paymentStatus: "PAID" | "PENDING" | "NONE" }) {
  const current = await loadSubscription(id);
  if (current.status === "CANCELLED") {
    throw new BillingError(400, "INVALID", "This subscription is cancelled. Create a new one if they come back. Payments and history stay on this record.");
  }
  const schedule = renewalSchedule({
    now: Date.now(),
    startsAt: current.startsAt.getTime(),
    endsAt: current.endsAt.getTime(),
    period: input.period,
    listPriceInr: current.plan.listPriceInr,
  });
  await updateSubscription(actor, id, {
    startsAt: new Date(schedule.startsAt),
    endsAt: new Date(schedule.endsAt),
    amountInr: schedule.amountInr,
    billingPeriod: schedule.billingPeriod,
    status: "ACTIVE",
    eventAction: "RENEWED",
    eventNote: `Renewed. New expiry ${formatDeskDate(schedule.endsAt)}. Listed price ${formatInr(schedule.amountInr)}.`,
  });
  if ((input.paymentStatus === "PAID" || input.paymentStatus === "PENDING") && schedule.amountInr > 0) {
    await recordPayment(actor, {
      subscriptionId: id,
      amountInr: schedule.amountInr,
      paidAt: new Date(),
      method: "OTHER",
      transactionRef: "",
      invoiceRef: "",
      status: input.paymentStatus,
      notes: LEDGER_NOTE,
    });
  }
  return { expiresOn: formatDeskDate(schedule.endsAt), amountLabel: formatInr(schedule.amountInr), durationLabel: `${schedule.durationDays} days` };
}

export async function extendDeskSubscription(actor: { id: string; role: string }, id: string, days: number) {
  const current = await loadSubscription(id);
  if (current.status === "CANCELLED") {
    throw new BillingError(400, "INVALID", "A cancelled subscription stays cancelled. Renew it if they come back. Payments and history stay.");
  }
  const schedule = extensionSchedule({ now: Date.now(), startsAt: current.startsAt.getTime(), endsAt: current.endsAt.getTime(), days });
  if (!schedule.ok) throw new BillingError(400, "INVALID", schedule.message);
  const expired = current.status === "EXPIRED" || current.endsAt.getTime() <= Date.now();
  const status = current.status === "SUSPENDED" ? "SUSPENDED" : current.status === "PENDING" ? "PENDING" : expired ? "ACTIVE" : current.status;
  await updateSubscription(actor, id, {
    startsAt: new Date(schedule.startsAt),
    endsAt: new Date(schedule.endsAt),
    status,
    eventAction: "EXTENDED",
    eventNote: `Extended to ${formatDeskDate(schedule.endsAt)}. Earlier history stays.`,
  });
  return { expiresOn: formatDeskDate(schedule.endsAt) };
}

export async function cancelDeskSubscription(actor: { id: string; role: string }, id: string) {
  const current = await loadSubscription(id);
  if (current.status === "CANCELLED") return { status: "CANCELLED" as const };
  await updateSubscription(actor, id, {
    status: "CANCELLED",
    eventAction: "CANCELLED",
    eventNote: "Cancelled. Payments and earlier history stay.",
  });
  return { status: "CANCELLED" as const };
}

export async function changeDeskPlan(actor: { id: string; role: string }, id: string, planCode: string) {
  const current = await loadSubscription(id);
  const plan = listedPlan(planCode);
  if (!plan) throw new BillingError(400, "INVALID", "Choose a plan.");
  const customerType = current.userId ? "player" : "gym";
  if (planCustomerType(plan.code) !== customerType) throw new BillingError(400, "INVALID", customerType === "gym" ? "Choose a gym plan." : "Choose a player plan.");
  let seatLimit: number | undefined;
  if (customerType === "gym" && current.gymId) {
    const allocation = await getPrisma().seatAllocation.findUnique({ where: { gymId: current.gymId } });
    const fallback = defaultSeatLimit(plan.code);
    let requested = allocation?.seatLimit ?? fallback;
    if (requested !== null) {
      const check = seatLimitForPlan(plan.code, requested);
      if (!check.ok && fallback !== null) requested = fallback;
    }
    seatLimit = requested ?? undefined;
  }
  await updateSubscription(actor, id, {
    planCode: plan.code,
    amountInr: plan.listPriceInr,
    seatLimit,
    eventAction: "UPDATED",
    eventNote: `Plan changed to ${plan.name}.`,
  });
  return { planName: plan.name, amountLabel: formatInr(plan.listPriceInr) };
}

export async function editDeskContact(actor: { id: string; role: string }, id: string, input: { name: string; phone: string }) {
  const phone = normalizePhone(input.phone);
  const name = cleanName(input.name);
  if (!phone) throw new BillingError(400, "INVALID", "Enter a mobile number, including +91.");
  if (name.length < 2) throw new BillingError(400, "INVALID", "Enter the customer name.");
  const current = await getPrisma().subscription.findUnique({
    where: { id },
    include: { user: true, gym: { include: { owner: true } } },
  });
  if (!current) throw new BillingError(404, "NOT_FOUND", "Subscription not found.");
  if (current.userId) {
    const others = await getPrisma().user.findMany({ where: { phone, NOT: { id: current.userId } }, select: { displayName: true } });
    const other = others[0];
    if (other) throw new BillingError(409, "PHONE", `That phone belongs to ${other.displayName}. Choose that customer instead of changing this one.`);
    await getPrisma().user.update({ where: { id: current.userId }, data: { displayName: name, phone } });
    await auditAdminAction(actor, "user.update", "User", current.userId, { displayName: name });
    return { name, phoneLabel: formatPhone(phone) };
  }
  if (!current.gymId || !current.gym) throw new BillingError(404, "NOT_FOUND", "Subscription not found.");
  const others = await getPrisma().user.findMany({ where: { phone, NOT: { id: current.gym.ownerId } }, select: { displayName: true } });
  const other = others[0];
  if (other) throw new BillingError(409, "PHONE", `That phone belongs to ${other.displayName}. Choose that customer instead of changing this one.`);
  await getPrisma().gym.update({ where: { id: current.gymId }, data: { name } });
  await getPrisma().user.update({ where: { id: current.gym.ownerId }, data: { phone } });
  await auditAdminAction(actor, "gym.update", "Gym", current.gymId, { name });
  return { name, phoneLabel: formatPhone(phone) };
}
