import { isSuperAdmin } from "../billing/policy";

export type MembershipRole = "OWNER" | "STAFF" | "MEMBER";
export type MembershipLife = "ACTIVE" | "ENDED";
export type BoardPeriod = "day" | "week" | "month" | "all";

export interface MembershipSpan {
  id: string;
  userId: string;
  gymId: string;
  role: MembershipRole;
  status: MembershipLife;
  assignedAt: number;
  endedAt: number | null;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A player seat covers a completion instant on the half-open interval [assignedAt, endedAt).
 * At the exact transfer timestamp the previous seat has ended and the new seat has started,
 * so the completion belongs to the new gym. A gap, or a staff/owner row, leaves the gym null.
 */
export function membershipCovers(span: MembershipSpan, at: number): boolean {
  if (span.role !== "MEMBER") return false;
  if (span.assignedAt > at) return false;
  if (span.endedAt !== null && span.endedAt <= at) return false;
  return true;
}

export function gymAtCompletion(spans: readonly MembershipSpan[], completedAt: number): string | null {
  const covering = spans.filter((span) => membershipCovers(span, completedAt));
  if (covering.length === 0) return null;
  covering.sort((a, b) => b.assignedAt - a.assignedAt || a.id.localeCompare(b.id));
  return covering[0]?.gymId ?? null;
}

export function activePlayMemberships<T extends { status: MembershipLife }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.status === "ACTIVE");
}

export interface AssignmentSeat {
  gymId: string;
  role: MembershipRole;
}

export interface AssignmentInput {
  actorRole: string;
  action: "assign" | "transfer" | "unassign";
  playerRole: string;
  playerStatus: "ACTIVE" | "SUSPENDED";
  active: AssignmentSeat | null;
  targetGymId: string | null;
  seatLimit: number | null;
  occupiedMembers: number;
  pendingInvites: number;
}

export type AssignmentDecision =
  | { ok: true; mode: "create" | "transfer" | "end" | "noop" }
  | { ok: false; code: string; message: string };

export function seatsAllowAnother(input: { seatLimit: number | null; occupiedMembers: number; pendingInvites: number }): AssignmentDecision | { ok: true } {
  if (input.seatLimit === null) return { ok: false, code: "NO_ALLOCATION", message: "Allocate seats before assigning a player." };
  if (input.occupiedMembers + input.pendingInvites >= input.seatLimit) {
    return { ok: false, code: "NO_SEATS", message: "This gym has no free member seats." };
  }
  return { ok: true };
}

export function decideAssignment(input: AssignmentInput): AssignmentDecision {
  if (!isSuperAdmin(input.actorRole)) return { ok: false, code: "FORBIDDEN", message: "Super Admin access is required." };
  if (input.playerStatus !== "ACTIVE") return { ok: false, code: "SUSPENDED", message: "This account is deactivated." };
  if (input.playerRole !== "PLAYER" && input.playerRole !== "INDIVIDUAL") {
    return { ok: false, code: "ROLE", message: "Only a player account can be assigned to a gym." };
  }
  if (input.active && input.active.role !== "MEMBER") {
    return { ok: false, code: "STAFF", message: "This account already has a staff or owner seat." };
  }
  if (input.action === "unassign") {
    if (!input.active) return { ok: false, code: "NOT_ASSIGNED", message: "This player is not assigned to a gym." };
    return { ok: true, mode: "end" };
  }
  if (!input.targetGymId) return { ok: false, code: "INVALID", message: "Choose a gym." };
  if (input.action === "assign") {
    if (input.active?.gymId === input.targetGymId) return { ok: true, mode: "noop" };
    if (input.active) {
      return { ok: false, code: "ALREADY_ASSIGNED", message: "This player already has a gym. Transfer them instead of creating a second membership." };
    }
    const seats = seatsAllowAnother(input);
    if (!("mode" in seats) && !seats.ok) return seats;
    return { ok: true, mode: "create" };
  }
  if (!input.active) return { ok: false, code: "NOT_ASSIGNED", message: "This player is not assigned to a gym." };
  if (input.active.gymId === input.targetGymId) return { ok: true, mode: "noop" };
  const seats = seatsAllowAnother(input);
  if (!("mode" in seats) && !seats.ok) return seats;
  return { ok: true, mode: "transfer" };
}

/** Owner invites and staff adds may fill an empty seat. They cannot transfer or open a second seat. */
export function decideMemberLink(input: {
  active: AssignmentSeat | null;
  gymId: string;
  seatLimit: number | null;
  occupiedMembers: number;
  pendingInvites: number;
}): AssignmentDecision {
  if (input.active?.gymId === input.gymId && input.active.role === "MEMBER") return { ok: true, mode: "noop" };
  if (input.active) {
    return { ok: false, code: "ALREADY_ASSIGNED", message: "This player already has a gym. A super admin has to transfer them." };
  }
  const seats = seatsAllowAnother(input);
  if (!("mode" in seats) && !seats.ok) return seats;
  return { ok: true, mode: "create" };
}

/** The browser gym id is ignored. Owners see the gym they own. Players see their active seat. */
export function ownerGymId(input: { role: string; ownedGymId: string | null; requestedGymId?: string | null }): string | null {
  void input.requestedGymId;
  if (input.role !== "GYM_OWNER") return null;
  return input.ownedGymId;
}

export function playerGymId(activeMemberGymId: string | null, requestedGymId?: string | null): string | null {
  void requestedGymId;
  return activeMemberGymId;
}

export function directoryAllowed(actor: { role: string; ownerGymId: string | null }, gymId: string): boolean {
  return actor.role === "GYM_OWNER" && actor.ownerGymId === gymId;
}

export function assignmentLabel(gymName: string | null): { assigned: boolean; label: string; showGymBoard: boolean } {
  if (!gymName) return { assigned: false, label: "Individual player", showGymBoard: false };
  return { assigned: true, label: gymName, showGymBoard: true };
}

export interface ScoreFact {
  userId: string;
  displayName: string;
  gymId: string | null;
  gameId: string | null;
  score: number;
  xp: number;
  completedAt: number;
}

export interface RankedPlayer {
  rank: number;
  userId: string;
  displayName: string;
  xp: number;
  bestScore: number;
  bestScoreAt: number;
}

export function rankGymScores(facts: readonly ScoreFact[], gymId: string, gameId: string | null): RankedPlayer[] {
  const grouped = new Map<string, RankedPlayer>();
  for (const fact of facts) {
    if (fact.gymId !== gymId) continue;
    if (gameId && fact.gameId !== gameId) continue;
    const current = grouped.get(fact.userId);
    if (!current) {
      grouped.set(fact.userId, {
        rank: 0,
        userId: fact.userId,
        displayName: fact.displayName,
        xp: fact.xp,
        bestScore: fact.score,
        bestScoreAt: fact.completedAt,
      });
      continue;
    }
    current.xp += fact.xp;
    if (fact.score > current.bestScore || (fact.score === current.bestScore && fact.completedAt < current.bestScoreAt)) {
      current.bestScore = fact.score;
      current.bestScoreAt = fact.completedAt;
    }
  }
  const ranked = [...grouped.values()].sort(
    (a, b) => b.xp - a.xp || b.bestScore - a.bestScore || a.bestScoreAt - b.bestScoreAt || a.userId.localeCompare(b.userId),
  );
  ranked.forEach((row, index) => {
    row.rank = index + 1;
  });
  return ranked;
}

export function publicBoard(rows: readonly RankedPlayer[]): Array<{ rank: number; displayName: string; xp: number; bestScore: number }> {
  return rows.map((row) => ({ rank: row.rank, displayName: row.displayName, xp: row.xp, bestScore: row.bestScore }));
}

function kolkataParts(now: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { year: Number(pick("year")), month: Number(pick("month")), day: Number(pick("day")), weekday: weekday[pick("weekday")] ?? 1 };
}

export function kolkataMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

/** Inclusive start and exclusive end. All-time has no bounds. Weeks start Monday 00:00 Asia/Kolkata. */
export function kolkataWindow(period: BoardPeriod, now: Date): { start: Date | null; end: Date | null } {
  if (period === "all") return { start: null, end: null };
  const parts = kolkataParts(now);
  const dayStart = kolkataMidnightUtc(parts.year, parts.month, parts.day);
  if (period === "day") return { start: dayStart, end: new Date(dayStart.getTime() + DAY_MS) };
  if (period === "week") {
    const start = new Date(dayStart.getTime() - (parts.weekday - 1) * DAY_MS);
    return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
  }
  const start = kolkataMidnightUtc(parts.year, parts.month, 1);
  const end = parts.month === 12 ? kolkataMidnightUtc(parts.year + 1, 1, 1) : kolkataMidnightUtc(parts.year, parts.month + 1, 1);
  return { start, end };
}

export function inWindow(completedAt: number, window: { start: Date | null; end: Date | null }): boolean {
  if (window.start && completedAt < window.start.getTime()) return false;
  if (window.end && completedAt >= window.end.getTime()) return false;
  return true;
}
