import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decidePlay } from "../billing/policy";
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
  seatsAllowAnother,
  type MembershipSpan,
} from "./policy";

const now = Date.parse("2026-10-24T06:30:00.000Z");
const day = 24 * 60 * 60 * 1000;

function span(partial: Partial<MembershipSpan> & Pick<MembershipSpan, "id" | "gymId">): MembershipSpan {
  return {
    userId: "player-1",
    role: "MEMBER",
    status: "ENDED",
    assignedAt: now - day,
    endedAt: null,
    ...partial,
  };
}

describe("gym assignment policy", () => {
  it("lets a super admin assign a free player and refuses every other role", () => {
    const open = { playerRole: "PLAYER", playerStatus: "ACTIVE" as const, active: null, targetGymId: "gym-a", seatLimit: 49, occupiedMembers: 1, pendingInvites: 0 };
    expect(decideAssignment({ actorRole: "SUPER_ADMIN", action: "assign", ...open }).ok).toBe(true);
    expect(decideAssignment({ actorRole: "ADMIN", action: "assign", ...open }).ok).toBe(true);
    for (const actorRole of ["GYM_OWNER", "PLAYER", "INDIVIDUAL"]) {
      const decision = decideAssignment({ actorRole, action: "assign", ...open });
      expect(decision.ok).toBe(false);
      if (!decision.ok) expect(decision.code).toBe("FORBIDDEN");
    }
  });

  it("shows an owner only their own players", () => {
    expect(directoryAllowed({ role: "GYM_OWNER", ownerGymId: "gym-a" }, "gym-a")).toBe(true);
    expect(ownerGymId({ role: "GYM_OWNER", ownedGymId: "gym-a", requestedGymId: "gym-b" })).toBe("gym-a");
  });

  it("hides that directory from another owner and from a player", () => {
    expect(directoryAllowed({ role: "GYM_OWNER", ownerGymId: "gym-a" }, "gym-b")).toBe(false);
    expect(directoryAllowed({ role: "PLAYER", ownerGymId: null }, "gym-a")).toBe(false);
    expect(ownerGymId({ role: "GYM_OWNER", ownedGymId: "gym-b", requestedGymId: "gym-a" })).toBe("gym-b");
  });

  it("lets a player see only the gym of their active seat", () => {
    expect(playerGymId("gym-a", "gym-b")).toBe("gym-a");
    expect(assignmentLabel("Pulse District").showGymBoard).toBe(true);
  });

  it("drops every other gym from a board before it is ranked", () => {
    const ranked = rankGymScores(
      [
        { userId: "a", displayName: "Ada", gymId: "gym-a", gameId: "fit", score: 10, xp: 5, completedAt: now },
        { userId: "b", displayName: "Bea", gymId: "gym-b", gameId: "fit", score: 99, xp: 90, completedAt: now },
      ],
      "gym-a",
      null,
    );
    expect(ranked.map((row) => row.displayName)).toEqual(["Ada"]);
    expect(publicBoard(ranked)[0]).toEqual({ rank: 1, displayName: "Ada", xp: 5, bestScore: 10 });
    expect(publicBoard(ranked)[0]).not.toHaveProperty("userId");
  });

  it("keeps a finished workout on the old gym after a transfer", () => {
    const transferAt = now;
    const oldSeat = span({ id: "old", gymId: "gym-a", assignedAt: transferAt - day, endedAt: transferAt });
    const nextSeat = span({ id: "next", gymId: "gym-b", status: "ACTIVE", assignedAt: transferAt, endedAt: null });
    expect(gymAtCompletion([oldSeat, nextSeat], transferAt - 1)).toBe("gym-a");
    expect(gymAtCompletion([oldSeat], transferAt - day)).toBe("gym-a");
  });

  it("counts a workout that finishes at the transfer instant for the new gym", () => {
    const transferAt = now;
    const oldSeat = span({ id: "old", gymId: "gym-a", assignedAt: transferAt - day, endedAt: transferAt });
    const nextSeat = span({ id: "next", gymId: "gym-b", status: "ACTIVE", assignedAt: transferAt, endedAt: null });
    expect(gymAtCompletion([oldSeat, nextSeat], transferAt)).toBe("gym-b");
    expect(gymAtCompletion([oldSeat, nextSeat], transferAt + 1000)).toBe("gym-b");
  });

  it("allows one active player membership and rejects a second assign", () => {
    const decision = decideAssignment({
      actorRole: "SUPER_ADMIN",
      action: "assign",
      playerRole: "INDIVIDUAL",
      playerStatus: "ACTIVE",
      active: { gymId: "gym-a", role: "MEMBER" },
      targetGymId: "gym-b",
      seatLimit: 49,
      occupiedMembers: 1,
      pendingInvites: 0,
    });
    expect(decision).toMatchObject({ ok: false, code: "ALREADY_ASSIGNED" });
    expect(decideMemberLink({ active: { gymId: "gym-a", role: "MEMBER" }, gymId: "gym-b", seatLimit: 49, occupiedMembers: 0, pendingInvites: 0 }).ok).toBe(false);
    const sql = readFileSync("packages/db/prisma/migrations/20261024120000_gym_membership_history/migration.sql", "utf8");
    expect(sql).toContain("GymMembership_one_active_player");
    expect(sql).toContain("WHERE \"status\" = 'ACTIVE' AND \"role\" = 'MEMBER'");
  });

  it("stops an assignment that would pass the seat limit", () => {
    expect(seatsAllowAnother({ seatLimit: 49, occupiedMembers: 49, pendingInvites: 0 })).toMatchObject({ ok: false, code: "NO_SEATS" });
    expect(seatsAllowAnother({ seatLimit: 49, occupiedMembers: 48, pendingInvites: 1 })).toMatchObject({ ok: false, code: "NO_SEATS" });
    expect(seatsAllowAnother({ seatLimit: null, occupiedMembers: 0, pendingInvites: 0 })).toMatchObject({ ok: false, code: "NO_ALLOCATION" });
    expect(decideAssignment({
      actorRole: "SUPER_ADMIN",
      action: "transfer",
      playerRole: "PLAYER",
      playerStatus: "ACTIVE",
      active: { gymId: "gym-a", role: "MEMBER" },
      targetGymId: "gym-b",
      seatLimit: 49,
      occupiedMembers: 49,
      pendingInvites: 0,
    })).toMatchObject({ ok: false, code: "NO_SEATS" });
    expect(readFileSync("packages/db/src/gym/service.ts", "utf8")).toContain("FOR UPDATE");
  });

  it("does not let an expired gym grant play, and ignores an ended seat", () => {
    const expired = decidePlay({
      signedIn: true,
      accountStatus: "ACTIVE",
      gyms: [{ gymId: "gym-a", flag: "EXPIRED", subscriptions: [{ scope: "gym", status: "EXPIRED", endsAt: now - day, paid: true, gymId: "gym-a" }] }],
      now,
    });
    expect(expired.allowed).toBe(false);
    const ended = activePlayMemberships([{ status: "ENDED" as const, gymId: "gym-a" }, { status: "ACTIVE" as const, gymId: "gym-b" }]);
    expect(ended.map((row) => row.gymId)).toEqual(["gym-b"]);
    const individual = decidePlay({ signedIn: true, accountStatus: "ACTIVE", gyms: [], now });
    expect(individual.allowed && individual.mode).toBe("demo");
  });

  it("rejects a client gym id on the owner, player, and public routes", () => {
    const directory = readFileSync("apps/web/src/app/api/gym/directory/route.ts", "utf8");
    const ownerBoard = readFileSync("apps/web/src/app/api/gym/leaderboard/route.ts", "utf8");
    const floor = readFileSync("apps/web/src/app/api/gym/floor/route.ts", "utf8");
    const admin = readFileSync("apps/web/src/app/api/admin/assignments/route.ts", "utf8");
    const pub = readFileSync("apps/web/src/app/api/leaderboard/route.ts", "utf8");
    expect(directory).not.toContain("gymId");
    expect(ownerBoard).not.toContain("gymId");
    expect(floor).not.toContain("searchParams");
    expect(admin).toContain("requireSuperAdmin");
    expect(pub).not.toContain("gymId");
    expect(playerGymId(null, "gym-b")).toBeNull();
  });

  it("keeps realtime rooms on the session id", () => {
    const source = readFileSync("apps/realtime/src/server.ts", "utf8");
    expect(source).toContain("session:${sessionId}");
    expect(source).not.toMatch(/join\(`gym:/);
    expect(source).not.toContain("gym:${");
  });

  it("ranks ties by gym XP, then best score, then earlier best score, then user id", () => {
    const ranked = rankGymScores(
      [
        { userId: "b", displayName: "Bea", gymId: "gym-a", gameId: "fit", score: 20, xp: 10, completedAt: now },
        { userId: "a", displayName: "Ada", gymId: "gym-a", gameId: "fit", score: 20, xp: 10, completedAt: now - 1000 },
        { userId: "c", displayName: "Cy", gymId: "gym-a", gameId: "fit", score: 50, xp: 10, completedAt: now + 1000 },
        { userId: "d", displayName: "Dee", gymId: "gym-a", gameId: "other", score: 1, xp: 100, completedAt: now },
      ],
      "gym-a",
      "fit",
    );
    expect(ranked.map((row) => row.userId)).toEqual(["c", "a", "b"]);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it("uses Asia/Kolkata day, week, and month windows", () => {
    const instant = new Date("2026-10-24T06:30:00.000Z");
    expect(kolkataWindow("day", instant)).toEqual({
      start: new Date("2026-10-23T18:30:00.000Z"),
      end: new Date("2026-10-24T18:30:00.000Z"),
    });
    expect(kolkataWindow("week", instant)).toEqual({
      start: new Date("2026-10-18T18:30:00.000Z"),
      end: new Date("2026-10-25T18:30:00.000Z"),
    });
    expect(kolkataWindow("month", instant)).toEqual({
      start: new Date("2026-09-30T18:30:00.000Z"),
      end: new Date("2026-10-31T18:30:00.000Z"),
    });
    const dayWindow = kolkataWindow("day", instant);
    expect(inWindow(Date.parse("2026-10-23T18:30:00.000Z"), dayWindow)).toBe(true);
    expect(inWindow(Date.parse("2026-10-23T18:29:59.000Z"), dayWindow)).toBe(false);
    expect(kolkataWindow("all", instant)).toEqual({ start: null, end: null });
  });

  it("leaves an unassigned player on the individual path with no gym board", () => {
    expect(assignmentLabel(null)).toEqual({ assigned: false, label: "Individual player", showGymBoard: false });
    expect(gymAtCompletion([], now)).toBeNull();
    expect(gymAtCompletion([span({ id: "staff", gymId: "gym-a", role: "OWNER", status: "ACTIVE" })], now)).toBeNull();
    const play = decidePlay({
      signedIn: true,
      accountStatus: "ACTIVE",
      individualSubs: [{ scope: "individual", status: "ACTIVE", endsAt: now + day, paid: true }],
      gyms: [],
      now,
    });
    expect(play.allowed && play.mode).toBe("paid");
  });
});
