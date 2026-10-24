export const PUBLIC_SELF_REGISTRATION = false;

export const PUBLIC_PLANS = [
  { code: "free_demo", name: "Free demo", listPriceInr: 0, seatMax: null },
  { code: "individual_pro", name: "Individual Pro", listPriceInr: 999, seatMax: null },
  { code: "gym_starter", name: "Gym Starter", listPriceInr: 19999, seatMax: 49 },
  { code: "gym_pro", name: "Gym Pro", listPriceInr: 39999, seatMax: 99 },
] as const;

import { isIndividualRole, isSuperAdminRole } from "@fitplay/shared";

export type AppRole = "PLAYER" | "GYM_OWNER" | "ADMIN" | "SUPER_ADMIN" | "INDIVIDUAL";
export type AccountStatus = "ACTIVE" | "SUSPENDED";
export type SubStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED";
export type GymFlag = "ACTIVE" | "TRIALING" | "EXPIRED";

export function isSuperAdmin(role: string): boolean {
  return isSuperAdminRole(role);
}

export function isIndividual(role: string): boolean {
  return isIndividualRole(role);
}

export function roleSatisfies(role: string, allowed: readonly string[]): boolean {
  if (allowed.includes(role)) return true;
  if (isSuperAdmin(role) && allowed.some((item) => isSuperAdmin(item))) return true;
  if (isIndividual(role) && allowed.some((item) => isIndividual(item))) return true;
  return false;
}

export function canReadAdmin(role: string): boolean {
  return isSuperAdmin(role);
}

export function canActivateSubscription(role: string): boolean {
  return isSuperAdmin(role);
}

export function canRecordPayment(role: string): boolean {
  return isSuperAdmin(role);
}

export function canReadGym(actor: { role: string; gymIds: readonly string[] }, gymId: string): boolean {
  if (isSuperAdmin(actor.role)) return true;
  if (actor.role === "GYM_OWNER") return actor.gymIds.includes(gymId);
  return false;
}

export interface AuditDraft {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

export class AccessError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function prepareAdminWrite(input: {
  role: string;
  action: string;
  actorId: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}): { audit: AuditDraft } {
  if (!isSuperAdmin(input.role)) {
    throw new AccessError("FORBIDDEN", "Super Admin access is required.");
  }
  if (input.action.startsWith("payment.") && !canRecordPayment(input.role)) {
    throw new AccessError("FORBIDDEN", "Only a Super Admin can record a payment.");
  }
  if (input.action === "subscription.activate" && !canActivateSubscription(input.role)) {
    throw new AccessError("FORBIDDEN", "Only a Super Admin can activate a subscription.");
  }
  const metadata = input.metadata ? { ...input.metadata } : undefined;
  if (metadata) {
    delete metadata.password;
    delete metadata.passwordHash;
    delete metadata.temporaryPassword;
    delete metadata.token;
  }
  return {
    audit: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata,
    },
  };
}

export interface Journal {
  audits: AuditDraft[];
  payments: Array<{ subscriptionId: string; amountInr: number; status: string }>;
}

export function applyAdminCommand(
  journal: Journal,
  command: {
    role: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
    payment?: { subscriptionId: string; amountInr: number; status: string };
  },
): Journal {
  const prepared = prepareAdminWrite(command);
  return {
    audits: [...journal.audits, prepared.audit],
    payments: command.payment ? [...journal.payments, command.payment] : journal.payments,
  };
}

export interface PaidSub {
  scope: "individual" | "gym";
  status: SubStatus;
  endsAt: number;
  paid: boolean;
  gymId?: string | null;
}

export interface GymLink {
  gymId: string;
  flag: GymFlag;
  subscriptions: PaidSub[];
}

export type PlayDecision =
  | { allowed: true; mode: "guest" | "demo" | "paid" }
  | { allowed: false; reason: "suspended" | "expired_individual" | "expired_gym" | "password_change_required"; message: string };

const EXPIRED_INDIVIDUAL =
  "Your PlayFit Club subscription has expired. Your history is still here. Ask the PlayFit Club team to renew it on WhatsApp. Opening WhatsApp does not renew or activate the subscription.";
const EXPIRED_GYM =
  "This gym subscription has expired. Member accounts and history stay in place. New play starts again after the PlayFit Club team renews it. Opening WhatsApp does not renew or activate the subscription.";

function effective(status: SubStatus, endsAt: number, now: number): SubStatus {
  if (status === "ACTIVE" && endsAt <= now) return "EXPIRED";
  return status;
}

function blocking(status: SubStatus): boolean {
  return status === "EXPIRED" || status === "SUSPENDED" || status === "CANCELLED";
}

function gymCurrentlyPaid(link: GymLink, now: number): boolean {
  const records = link.subscriptions.filter((sub) => sub.paid && sub.scope === "gym");
  if (records.length > 0) {
    return records.some((sub) => effective(sub.status, sub.endsAt, now) === "ACTIVE");
  }
  return link.flag === "ACTIVE";
}

function gymPaidAndBlocked(link: GymLink, now: number): boolean {
  if (gymCurrentlyPaid(link, now)) return false;
  const records = link.subscriptions.filter((sub) => sub.paid && sub.scope === "gym");
  if (records.some((sub) => blocking(effective(sub.status, sub.endsAt, now)))) return true;
  return link.flag === "EXPIRED";
}

export function decidePlay(input: {
  signedIn: boolean;
  accountStatus?: AccountStatus;
  mustChangePassword?: boolean;
  individualSubs?: PaidSub[];
  gyms?: GymLink[];
  now: number;
}): PlayDecision {
  if (!input.signedIn) return { allowed: true, mode: "guest" };
  if (input.accountStatus === "SUSPENDED") {
    return { allowed: false, reason: "suspended", message: "This account is deactivated. Contact the PlayFit Club team." };
  }
  if (input.mustChangePassword) {
    return {
      allowed: false,
      reason: "password_change_required",
      message: "Set a new password before starting play.",
    };
  }
  const now = input.now;
  const individual = (input.individualSubs ?? []).filter((sub) => sub.paid && sub.scope === "individual");
  const individualActive = individual.some((sub) => effective(sub.status, sub.endsAt, now) === "ACTIVE");
  const gyms = input.gyms ?? [];
  const gymActive = gyms.some((gym) => gymCurrentlyPaid(gym, now));
  if (individualActive || gymActive) return { allowed: true, mode: "paid" };
  const individualBlocked = individual.some((sub) => blocking(effective(sub.status, sub.endsAt, now)));
  if (individualBlocked) return { allowed: false, reason: "expired_individual", message: EXPIRED_INDIVIDUAL };
  if (gyms.some((gym) => gymPaidAndBlocked(gym, now))) return { allowed: false, reason: "expired_gym", message: EXPIRED_GYM };
  return { allowed: true, mode: "demo" };
}

export function decideGameSessionStart(input: Parameters<typeof decidePlay>[0]): { ok: true } | { ok: false; code: string; message: string } {
  const decision = decidePlay(input);
  if (decision.allowed) return { ok: true };
  const code = decision.reason === "expired_individual" || decision.reason === "expired_gym" ? "SUBSCRIPTION_EXPIRED" : "PLAY_BLOCKED";
  return { ok: false, code, message: decision.message };
}

export function seatsAvailable(input: { seatLimit: number | null; occupied: number; pendingInvites: number }): number {
  if (input.seatLimit === null) return 0;
  return input.seatLimit - input.occupied - input.pendingInvites;
}

export function canInvite(input: {
  actorRole: string;
  actorGymIds: readonly string[];
  gymId: string;
  seatLimit: number | null;
  occupied: number;
  pendingInvites: number;
}): { ok: true } | { ok: false; reason: "not_owner" | "other_gym" | "no_seats" | "no_allocation" } {
  if (input.actorRole !== "GYM_OWNER" && !isSuperAdmin(input.actorRole)) return { ok: false, reason: "not_owner" };
  if (!isSuperAdmin(input.actorRole) && !input.actorGymIds.includes(input.gymId)) return { ok: false, reason: "other_gym" };
  if (input.seatLimit === null) return { ok: false, reason: "no_allocation" };
  if (seatsAvailable(input) < 1) return { ok: false, reason: "no_seats" };
  return { ok: true };
}

export function seatLimitForPlan(code: string, requested: number): { ok: true; seatLimit: number } | { ok: false; message: string } {
  if (!Number.isInteger(requested) || requested < 1) return { ok: false, message: "Seat limit must be a positive whole number." };
  if (code === "gym_starter" && requested > 49) return { ok: false, message: "Gym Starter includes up to 49 accounts." };
  if (code === "gym_pro" && (requested < 51 || requested > 99)) return { ok: false, message: "Gym Pro includes 51 to 99 accounts." };
  return { ok: true, seatLimit: requested };
}

export function inviteGrantsPlay(input: {
  gymActive: boolean;
  seatFree: boolean;
  inviteValid: boolean;
  memberLinked: boolean;
}): boolean {
  return input.gymActive && input.seatFree && input.inviteValid && input.memberLinked;
}

/** Subscriptions that end inside this window are "Expiring soon". */
export const EXPIRING_SOON_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export type BillingTerm = "MONTHLY" | "QUARTERLY" | "YEARLY";
export type DeskPaymentStatus = "PAID" | "PENDING" | "PARTIAL";

export interface AccountCandidate {
  id: string;
  name: string;
  phone: string | null;
}

export type AccountChoice =
  | { action: "invalid"; message: string }
  | { action: "use"; id: string; reason: "confirmed" | "same_phone_and_name" }
  | {
      action: "choose";
      matches: AccountCandidate[];
      canCreate: boolean;
      reason: "shared_phone" | "ambiguous_same_person" | "name_only";
      message: string;
    }
  | { action: "create" };

export function normalizePersonName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function namesMatch(left: string, right: string): boolean {
  const a = normalizePersonName(left);
  const b = normalizePersonName(right);
  return a.length > 0 && a === b;
}

/** Indian mobile numbers, stored as +91 and ten digits. Returns null when the value is not a mobile number. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.trim().replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return null;
  let national = digits;
  if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
  else if (national.length === 11 && national.startsWith("0")) national = national.slice(1);
  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return `+91${national}`;
}

export function formatPhone(normalized: string | null | undefined): string {
  if (!normalized) return "No phone yet";
  const match = /^\+91(\d{5})(\d{5})$/.exec(normalized);
  if (!match) return normalized;
  return `+91 ${match[1]} ${match[2]}`;
}

/**
 * Pick an existing customer, or allow a new account.
 * The same phone is never silently given to a second person.
 * The same phone and the same name resolve to that one customer when there is exactly one.
 */
export function chooseAccount(input: {
  name: string;
  phone: string;
  existing: readonly AccountCandidate[];
  confirmedId?: string | null;
  createAccount?: boolean;
}): AccountChoice {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { action: "invalid", message: "Enter the customer name." };
  const phone = normalizePhone(input.phone);
  if (!phone) return { action: "invalid", message: "Enter a mobile number, including +91." };

  const existing = input.existing.map((person) => ({
    ...person,
    name: person.name.trim().replace(/\s+/g, " "),
    phone: person.phone ? normalizePhone(person.phone) ?? person.phone : null,
  }));
  const phoneMatches = existing.filter((person) => person.phone === phone);
  const samePerson = phoneMatches.filter((person) => namesMatch(person.name, name));

  if (input.confirmedId) {
    const picked = existing.find((person) => person.id === input.confirmedId);
    if (!picked) return { action: "invalid", message: "Choose one of the matching customers." };
    const otherOwners = phoneMatches.filter((person) => person.id !== picked.id);
    if (otherOwners.length > 0 && picked.phone !== phone) {
      return {
        action: "choose",
        matches: otherOwners,
        canCreate: false,
        reason: "shared_phone",
        message: "That phone already belongs to someone else. Choose that customer. A second account is not created for the same phone.",
      };
    }
    return { action: "use", id: picked.id, reason: "confirmed" };
  }

  if (samePerson.length === 1) {
    const person = samePerson[0];
    if (!person) return { action: "invalid", message: "Enter the customer name." };
    return { action: "use", id: person.id, reason: "same_phone_and_name" };
  }
  if (samePerson.length > 1) {
    return {
      action: "choose",
      matches: samePerson,
      canCreate: false,
      reason: "ambiguous_same_person",
      message: "More than one customer has this name and phone. Choose which one to use. They are not merged.",
    };
  }
  if (phoneMatches.length > 0) {
    return {
      action: "choose",
      matches: phoneMatches,
      canCreate: false,
      reason: "shared_phone",
      message: "This phone belongs to a customer with a different name. Choose that customer. A second account is not created for the same phone.",
    };
  }

  const nameMatches = existing.filter((person) => namesMatch(person.name, name));
  if (nameMatches.length > 0 && !input.createAccount) {
    return {
      action: "choose",
      matches: nameMatches,
      canCreate: true,
      reason: "name_only",
      message: "A customer with this name already exists, with a different phone. Choose that customer, or create a new account.",
    };
  }
  return { action: "create" };
}

export function listedPlan(code: string) {
  return PUBLIC_PLANS.find((plan) => plan.code === code) ?? null;
}

export function planCustomerType(code: string): "player" | "gym" | null {
  if (code === "free_demo" || code === "individual_pro") return "player";
  if (code === "gym_starter" || code === "gym_pro") return "gym";
  return null;
}

export function defaultSeatLimit(code: string): number | null {
  if (code === "gym_starter") return 49;
  if (code === "gym_pro") return 99;
  return null;
}

export function seatCapacityLabel(code: string): string | null {
  if (code === "gym_starter") return "Up to 49 seats";
  if (code === "gym_pro") return "51–99 seats";
  return null;
}

/** Add a billing period in UTC, clamping short months (31 Jan + 1 month = 28 or 29 Feb). */
export function addBillingPeriod(fromMs: number, period: BillingTerm): number {
  const date = new Date(fromMs);
  const months = period === "MONTHLY" ? 1 : period === "QUARTERLY" ? 3 : 12;
  const day = date.getUTCDate();
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return shifted.getTime();
}

export function renewalSchedule(input: {
  now: number;
  startsAt: number;
  endsAt: number;
  period: BillingTerm;
  listPriceInr: number;
}): { startsAt: number; endsAt: number; amountInr: number; durationDays: number; billingPeriod: BillingTerm } {
  const open = input.endsAt > input.now;
  const anchor = open ? input.endsAt : input.now;
  const endsAt = addBillingPeriod(anchor, input.period);
  return {
    startsAt: open ? input.startsAt : input.now,
    endsAt,
    amountInr: input.listPriceInr,
    durationDays: Math.max(1, Math.round((endsAt - anchor) / DAY_MS)),
    billingPeriod: input.period,
  };
}

export function extensionSchedule(input: {
  now: number;
  startsAt: number;
  endsAt: number;
  days: number;
}): { ok: true; startsAt: number; endsAt: number } | { ok: false; message: string } {
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 3650) {
    return { ok: false, message: "Extend by a whole number of days, from 1 to 3650." };
  }
  const open = input.endsAt > input.now;
  const anchor = open ? input.endsAt : input.now;
  return { ok: true, startsAt: open ? input.startsAt : input.now, endsAt: anchor + input.days * DAY_MS };
}

/** A calendar day from the admin form, interpreted as midnight in India. */
export function parseDeskDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const check = new Date(utcMidnight);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return utcMidnight - IST_OFFSET_MS;
}

export function subscriptionQuote(input: {
  planCode: string;
  customerType: "player" | "gym";
  paymentStatus: DeskPaymentStatus;
  period?: BillingTerm;
  now: number;
  seatLimit?: number | null;
  startsAt?: number | null;
  endsAt?: number | null;
}):
  | {
      ok: true;
      planName: string;
      planCode: string;
      amountInr: number;
      discountInr: number;
      startsAt: number;
      endsAt: number;
      durationDays: number;
      billingPeriod: BillingTerm;
      seatLimit: number | null;
      seatLabel: string | null;
      status: SubStatus;
      paymentStatus: DeskPaymentStatus;
    }
  | { ok: false; message: string } {
  const plan = listedPlan(input.planCode);
  if (!plan) return { ok: false, message: "Choose a plan." };
  const kind = planCustomerType(plan.code);
  if (kind !== input.customerType) return { ok: false, message: input.customerType === "gym" ? "Choose a gym plan." : "Choose a player plan." };
  const period = input.period ?? "YEARLY";
  const startsAt = input.startsAt ?? input.now;
  const endsAt = input.endsAt ?? addBillingPeriod(startsAt, period);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
    return { ok: false, message: "The expiry date must be after the start date." };
  }
  let seatLimit: number | null = null;
  if (kind === "gym") {
    const requested = input.seatLimit ?? defaultSeatLimit(plan.code);
    if (requested === null) return { ok: false, message: "Choose a seat limit for this gym plan." };
    const seats = seatLimitForPlan(plan.code, requested);
    if (!seats.ok) return { ok: false, message: seats.message };
    seatLimit = seats.seatLimit;
  }
  const status: SubStatus = input.paymentStatus === "PAID" && endsAt > input.now ? "ACTIVE" : input.paymentStatus === "PAID" ? "EXPIRED" : "PENDING";
  return {
    ok: true,
    planName: plan.name,
    planCode: plan.code,
    amountInr: plan.listPriceInr,
    discountInr: 0,
    startsAt,
    endsAt,
    durationDays: Math.max(1, Math.round((endsAt - startsAt) / DAY_MS)),
    billingPeriod: period,
    seatLimit,
    seatLabel: seatCapacityLabel(plan.code),
    status,
    paymentStatus: input.paymentStatus,
  };
}

export function periodAmountPending(input: { amountInr: number; discountInr: number; paidInr: number }): number {
  return Math.max(0, input.amountInr - input.discountInr - Math.max(0, input.paidInr));
}

export function daysRemaining(endsAt: number, now: number): number {
  return Math.ceil((endsAt - now) / DAY_MS);
}

export function isInForce(status: SubStatus, endsAt: number, now: number): boolean {
  return status === "ACTIVE" && endsAt > now;
}

export function isExpiringSoon(status: SubStatus, endsAt: number, now: number): boolean {
  return isInForce(status, endsAt, now) && endsAt <= now + EXPIRING_SOON_DAYS * DAY_MS;
}

export function isDeskExpired(status: SubStatus, endsAt: number, now: number): boolean {
  return status === "EXPIRED" || (status === "ACTIVE" && endsAt <= now);
}

export function isPaymentPending(status: SubStatus, pendingInr: number): boolean {
  if (status === "CANCELLED" || status === "SUSPENDED") return pendingInr > 0;
  return status === "PENDING" || pendingInr > 0;
}

export function deskStatusLabel(input: { status: SubStatus; endsAt: number; now: number; pendingInr: number }): string {
  if (input.status === "CANCELLED") return "Cancelled";
  if (input.status === "SUSPENDED") return "Suspended";
  const pending = isPaymentPending(input.status, input.pendingInr);
  if (isDeskExpired(input.status, input.endsAt, input.now)) return pending ? "Expired · payment pending" : "Expired";
  if (isExpiringSoon(input.status, input.endsAt, input.now)) return pending ? "Expiring soon · payment pending" : "Expiring soon";
  if (isInForce(input.status, input.endsAt, input.now)) return pending ? "Active · payment pending" : "Active";
  if (pending) return "Payment pending";
  return "Pending";
}
