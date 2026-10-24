import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_SELF_REGISTRATION,
  applyAdminCommand,
  canActivateSubscription,
  canInvite,
  canReadAdmin,
  canReadGym,
  canRecordPayment,
  decideGameSessionStart,
  decidePlay,
  addBillingPeriod,
  chooseAccount,
  defaultSeatLimit,
  extensionSchedule,
  formatPhone,
  inviteGrantsPlay,
  normalizePhone,
  prepareAdminWrite,
  renewalSchedule,
  seatLimitForPlan,
  subscriptionQuote,
} from "./policy";

const now = Date.parse("2026-10-23T12:00:00.000Z");
const future = now + 20 * 24 * 60 * 60 * 1000;
const past = now - 24 * 60 * 60 * 1000;

describe("public registration and roles", () => {
  it("does not allow public self-registration", () => {
    expect(PUBLIC_SELF_REGISTRATION).toBe(false);
    const route = readFileSync("apps/web/src/app/api/auth/register/route.ts", "utf8");
    expect(route).toContain("REGISTRATION_CLOSED");
    expect(route).not.toContain("createUser");
    const page = readFileSync("apps/web/src/app/register/page.tsx", "utf8");
    expect(page).not.toContain("/api/auth/register");
  });

  it("blocks an individual from admin data and from other gyms", () => {
    expect(canReadAdmin("INDIVIDUAL")).toBe(false);
    expect(canReadAdmin("PLAYER")).toBe(false);
    expect(canReadAdmin("GYM_OWNER")).toBe(false);
    expect(canReadAdmin("SUPER_ADMIN")).toBe(true);
    expect(canReadAdmin("ADMIN")).toBe(true);
    expect(canReadGym({ role: "INDIVIDUAL", gymIds: ["gym-a"] }, "gym-a")).toBe(false);
    expect(canReadGym({ role: "INDIVIDUAL", gymIds: [] }, "gym-b")).toBe(false);
    expect(canReadGym({ role: "GYM_OWNER", gymIds: ["gym-a"] }, "gym-b")).toBe(false);
    expect(canReadGym({ role: "GYM_OWNER", gymIds: ["gym-a"] }, "gym-a")).toBe(true);
  });

  it("lets only a super admin activate a subscription or record a payment", () => {
    for (const role of ["INDIVIDUAL", "PLAYER", "GYM_OWNER"]) {
      expect(canActivateSubscription(role)).toBe(false);
      expect(canRecordPayment(role)).toBe(false);
      expect(() => prepareAdminWrite({ role, action: "subscription.activate", actorId: "u", targetType: "Subscription", targetId: "s" })).toThrow(/Super Admin/);
      expect(() => prepareAdminWrite({ role, action: "payment.record", actorId: "u", targetType: "Payment", targetId: "p" })).toThrow(/Super Admin/);
    }
    expect(canActivateSubscription("SUPER_ADMIN")).toBe(true);
    expect(canRecordPayment("ADMIN")).toBe(true);
  });
});

describe("seats and invites", () => {
  it("stops a gym owner from exceeding allocated seats or inviting into another gym", () => {
    expect(canInvite({ actorRole: "GYM_OWNER", actorGymIds: ["gym-a"], gymId: "gym-a", seatLimit: 49, occupied: 49, pendingInvites: 0 })).toEqual({
      ok: false,
      reason: "no_seats",
    });
    expect(canInvite({ actorRole: "GYM_OWNER", actorGymIds: ["gym-a"], gymId: "gym-b", seatLimit: 49, occupied: 0, pendingInvites: 0 })).toEqual({
      ok: false,
      reason: "other_gym",
    });
    expect(canInvite({ actorRole: "GYM_OWNER", actorGymIds: ["gym-a"], gymId: "gym-a", seatLimit: null, occupied: 0, pendingInvites: 0 })).toEqual({
      ok: false,
      reason: "no_allocation",
    });
    expect(canInvite({ actorRole: "GYM_OWNER", actorGymIds: ["gym-a"], gymId: "gym-a", seatLimit: 49, occupied: 10, pendingInvites: 1 }).ok).toBe(true);
    expect(inviteGrantsPlay({ gymActive: false, seatFree: true, inviteValid: true, memberLinked: true })).toBe(false);
    expect(inviteGrantsPlay({ gymActive: true, seatFree: true, inviteValid: true, memberLinked: true })).toBe(true);
  });
});

describe("game session start", () => {
  it("blocks an expired individual and does not leave the demo path open", () => {
    const decision = decideGameSessionStart({
      signedIn: true,
      accountStatus: "ACTIVE",
      individualSubs: [{ scope: "individual", status: "EXPIRED", endsAt: past, paid: true }],
      gyms: [],
      now,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe("SUBSCRIPTION_EXPIRED");
    expect(decidePlay({
      signedIn: true,
      accountStatus: "ACTIVE",
      individualSubs: [{ scope: "individual", status: "ACTIVE", endsAt: past, paid: true }],
      now,
    }).allowed).toBe(false);
  });

  it("blocks linked members when the gym subscription is expired", () => {
    const decision = decideGameSessionStart({
      signedIn: true,
      accountStatus: "ACTIVE",
      individualSubs: [],
      gyms: [{ gymId: "gym-a", flag: "EXPIRED", subscriptions: [{ scope: "gym", status: "EXPIRED", endsAt: past, paid: true, gymId: "gym-a" }] }],
      now,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.message).toMatch(/gym subscription has expired/i);
  });

  it("keeps guests and unpaid accounts on the demo path", () => {
    const guest = decidePlay({ signedIn: false, now });
    const unpaid = decidePlay({ signedIn: true, accountStatus: "ACTIVE", individualSubs: [], gyms: [], now });
    const trialing = decidePlay({
      signedIn: true,
      accountStatus: "ACTIVE",
      gyms: [{ gymId: "gym-a", flag: "TRIALING", subscriptions: [] }],
      now,
    });
    expect(guest.allowed && guest.mode).toBe("guest");
    expect(unpaid.allowed && unpaid.mode).toBe("demo");
    expect(trialing.allowed && trialing.mode).toBe("demo");
  });

  it("allows an active paid individual and an active gym", () => {
    const individual = decidePlay({
      signedIn: true,
      accountStatus: "ACTIVE",
      individualSubs: [{ scope: "individual", status: "ACTIVE", endsAt: future, paid: true }],
      now,
    });
    const gym = decidePlay({
      signedIn: true,
      accountStatus: "ACTIVE",
      gyms: [{ gymId: "gym-a", flag: "ACTIVE", subscriptions: [] }],
      now,
    });
    expect(individual.allowed && individual.mode).toBe("paid");
    expect(gym.allowed && gym.mode).toBe("paid");
  });
});

describe("subscription desk choices", () => {
  const now = Date.parse("2026-10-24T00:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;

  it("normalizes Indian mobile numbers, including +91", () => {
    for (const value of ["+91 95665 51345", "+919566551345", "919566551345", "09566551345", "9566551345", "0091 95665 51345"]) {
      expect(normalizePhone(value)).toBe("+919566551345");
    }
    expect(formatPhone("+919566551345")).toBe("+91 95665 51345");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("5566551345")).toBeNull();
  });

  it("uses the one customer when the same phone and the same name are already sure", () => {
    const choice = chooseAccount({
      name: "  Ari   Lane ",
      phone: "+91 90000 00001",
      existing: [{ id: "player-1", name: "Ari Lane", phone: "919000000001" }],
      createAccount: true,
    });
    expect(choice).toEqual({ action: "use", id: "player-1", reason: "same_phone_and_name" });
  });

  it("asks the admin to choose when a phone belongs to a different name and does not create another account", () => {
    const choice = chooseAccount({
      name: "Desk Check",
      phone: "9000000001",
      existing: [{ id: "player-2", name: "Ari Lane", phone: "+919000000001" }],
      createAccount: true,
    });
    expect(choice.action).toBe("choose");
    if (choice.action === "choose") {
      expect(choice.canCreate).toBe(false);
      expect(choice.reason).toBe("shared_phone");
      expect(choice.matches.map((match) => match.id)).toEqual(["player-2"]);
    }
  });

  it("does not merge two people who share a number, even when the name also matches", () => {
    const choice = chooseAccount({
      name: "Ari Lane",
      phone: "+91 90000 00001",
      existing: [
        { id: "player-1", name: "Ari Lane", phone: "+919000000001" },
        { id: "player-2", name: "Ari Lane", phone: "+919000000001" },
      ],
    });
    expect(choice.action).toBe("choose");
    if (choice.action === "choose") expect(choice.canCreate).toBe(false);
  });

  it("offers a new account only when nobody matches, and still shows a same name with a different phone", () => {
    expect(chooseAccount({ name: "Desk Check", phone: "+91 90000 00009", existing: [] })).toEqual({ action: "create" });
    const sameName = chooseAccount({
      name: "Ari Lane",
      phone: "+91 90000 00009",
      existing: [{ id: "player-1", name: "Ari Lane", phone: "+919000000001" }],
    });
    expect(sameName.action).toBe("choose");
    if (sameName.action === "choose") expect(sameName.canCreate).toBe(true);
    expect(chooseAccount({
      name: "Ari Lane",
      phone: "+91 90000 00009",
      existing: [{ id: "player-1", name: "Ari Lane", phone: "+919000000001" }],
      createAccount: true,
    })).toEqual({ action: "create" });
  });

  it("uses the customer the admin picked, and refuses a phone that belongs to someone else", () => {
    const existing = [
      { id: "player-1", name: "Ari Lane", phone: "+919111111111" },
      { id: "player-2", name: "Nova Hale", phone: "+919000000001" },
    ];
    expect(chooseAccount({ name: "Ari Lane", phone: "+91 90000 00001", existing, confirmedId: "player-2" })).toEqual({
      action: "use",
      id: "player-2",
      reason: "confirmed",
    });
    const blocked = chooseAccount({ name: "Ari Lane", phone: "+91 90000 00001", existing, confirmedId: "player-1" });
    expect(blocked.action).toBe("choose");
    if (blocked.action === "choose") expect(blocked.matches.map((match) => match.id)).toEqual(["player-2"]);
    expect(chooseAccount({ name: "Ari Lane", phone: "+91 90000 00009", existing, confirmedId: "missing" }).action).toBe("invalid");
  });

  it("extends an open subscription from its expiry and keeps the listed price", () => {
    const endsAt = now + 10 * day;
    const yearly = renewalSchedule({ now, startsAt: now - 20 * day, endsAt, period: "YEARLY", listPriceInr: 999 });
    expect(yearly.startsAt).toBe(now - 20 * day);
    expect(yearly.endsAt).toBe(addBillingPeriod(endsAt, "YEARLY"));
    expect(yearly.amountInr).toBe(999);
    const quarterly = renewalSchedule({ now, startsAt: now, endsAt: now + day, period: "QUARTERLY", listPriceInr: 39999 });
    expect(quarterly.amountInr).toBe(39999);
    expect(new Date(addBillingPeriod(Date.UTC(2026, 0, 31), "MONTHLY")).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(new Date(addBillingPeriod(Date.UTC(2024, 0, 31), "MONTHLY")).toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });

  it("starts a lapsed renewal from today and extends an open one by whole days", () => {
    const lapsed = renewalSchedule({ now, startsAt: now - 40 * day, endsAt: now - day, period: "MONTHLY", listPriceInr: 19999 });
    expect(lapsed.startsAt).toBe(now);
    expect(lapsed.endsAt).toBe(addBillingPeriod(now, "MONTHLY"));
    expect(lapsed.amountInr).toBe(19999);
    const extended = extensionSchedule({ now, startsAt: now - day, endsAt: now + 5 * day, days: 14 });
    expect(extended.ok).toBe(true);
    if (extended.ok) expect(extended.endsAt).toBe(now + 19 * day);
  });

  it("keeps gym seat limits inside the published plan", () => {
    expect(defaultSeatLimit("gym_starter")).toBe(49);
    expect(defaultSeatLimit("gym_pro")).toBe(99);
    expect(seatLimitForPlan("gym_starter", 49)).toEqual({ ok: true, seatLimit: 49 });
    expect(seatLimitForPlan("gym_starter", 50).ok).toBe(false);
    expect(seatLimitForPlan("gym_pro", 50).ok).toBe(false);
    expect(seatLimitForPlan("gym_pro", 51)).toEqual({ ok: true, seatLimit: 51 });
    expect(seatLimitForPlan("gym_pro", 100).ok).toBe(false);
    const starter = subscriptionQuote({ planCode: "gym_starter", customerType: "gym", paymentStatus: "PAID", now });
    expect(starter.ok && starter.seatLimit).toBe(49);
    expect(starter.ok && starter.amountInr).toBe(19999);
    expect(subscriptionQuote({ planCode: "gym_pro", customerType: "gym", paymentStatus: "PAID", now, seatLimit: 40 }).ok).toBe(false);
    const player = subscriptionQuote({ planCode: "individual_pro", customerType: "player", paymentStatus: "PENDING", now });
    expect(player.ok && player.amountInr).toBe(999);
    expect(player.ok && player.status).toBe("PENDING");
  });

  it("denies a gym owner another gym's records and another gym's seats", () => {
    expect(canReadGym({ role: "GYM_OWNER", gymIds: ["gym-a"] }, "gym-b")).toBe(false);
    expect(canReadGym({ role: "GYM_OWNER", gymIds: ["gym-a"] }, "gym-a")).toBe(true);
    expect(canInvite({ actorRole: "GYM_OWNER", actorGymIds: ["gym-a"], gymId: "gym-b", seatLimit: 49, occupied: 0, pendingInvites: 0 })).toEqual({
      ok: false,
      reason: "other_gym",
    });
    expect(canInvite({ actorRole: "GYM_OWNER", actorGymIds: ["gym-a"], gymId: "gym-a", seatLimit: 49, occupied: 49, pendingInvites: 0 })).toEqual({
      ok: false,
      reason: "no_seats",
    });
    expect(canInvite({ actorRole: "SUPER_ADMIN", actorGymIds: [], gymId: "gym-b", seatLimit: 49, occupied: 1, pendingInvites: 0 }).ok).toBe(true);
  });
});

describe("audit log", () => {
  it("writes an audit row for an admin action and refuses a payment from another role", () => {
    const journal = applyAdminCommand(
      { audits: [], payments: [] },
      {
        role: "SUPER_ADMIN",
        actorId: "admin-1",
        action: "payment.record",
        targetType: "Payment",
        targetId: "pay-1",
        payment: { subscriptionId: "sub-1", amountInr: 999, status: "PAID" },
        metadata: { amountInr: 999, password: "should-not-stick" },
      },
    );
    expect(journal.payments).toHaveLength(1);
    expect(journal.audits).toEqual([
      expect.objectContaining({
        actorId: "admin-1",
        action: "payment.record",
        targetType: "Payment",
        targetId: "pay-1",
      }),
    ]);
    expect(journal.audits[0]?.metadata).not.toHaveProperty("password");
    expect(() =>
      applyAdminCommand(
        { audits: [], payments: [] },
        { role: "GYM_OWNER", actorId: "owner", action: "payment.record", targetType: "Payment", targetId: "pay-2" },
      ),
    ).toThrow(/Super Admin/);
  });
});
