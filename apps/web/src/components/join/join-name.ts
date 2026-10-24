import { displayNameSchema } from "@fitplay/shared";

/** Matches `displayNameSchema` in the join payload (trimmed, 2–18). */
export const JOIN_NAME_MAX = 18;

export const JOIN_NAME_REQUIRED = "Enter your name.";
export const JOIN_NAME_SHORT = "Use at least 2 characters.";
export const JOIN_NAME_LONG = "Use 18 characters or fewer.";
export const JOIN_NAME_CHARS = "Use letters, numbers, and simple punctuation.";

export const JOIN_INVALID = "This game link isn't valid. Scan the QR on the TV or laptop again.";
export const JOIN_EXPIRED = "This game has ended. Start a new one on the TV or laptop.";
export const JOIN_OFFLINE = "The TV or laptop isn't connected. Check that screen, then try again.";
export const JOIN_FULL = "Another phone is already playing this game.";
export const JOIN_STARTED = "This game has already started. Start a new one on the TV or laptop.";
export const JOIN_WAIT = "Please wait a moment, then try again.";
export const JOIN_GENERIC = "Couldn't join the game. Try again.";

export function joinNameMessage(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return JOIN_NAME_REQUIRED;
  if (trimmed.length < 2) return JOIN_NAME_SHORT;
  if (trimmed.length > JOIN_NAME_MAX) return JOIN_NAME_LONG;
  if (!displayNameSchema.safeParse(trimmed).success) return JOIN_NAME_CHARS;
  return null;
}

/** Player-facing copy. The machine code stays off the screen. */
export function friendlyJoinError(code?: string, message?: string): string {
  const token = (code ?? "").toUpperCase();
  const text = (message ?? "").toLowerCase();
  if (token === "SESSION_FULL" || text.includes("full") || text.includes("maximum number")) return JOIN_FULL;
  if (token === "EXPIRED" || token === "CLOSED" || text.includes("expired") || text.includes("closed")) return JOIN_EXPIRED;
  if (token === "INVALID_PAYLOAD") return JOIN_NAME_CHARS;
  if (
    token === "INVALID_CODE" ||
    token === "SESSION_NOT_FOUND" ||
    text.includes("does not exist") ||
    text.includes("not found") ||
    text.includes("6 character") ||
    text.includes("6-character")
  ) {
    return JOIN_INVALID;
  }
  if (token === "NOT_JOINABLE" || text.includes("already started")) return JOIN_STARTED;
  if (token === "RATE_LIMITED" || text.includes("too many")) return JOIN_WAIT;
  if (
    text.includes("disconnect") ||
    text.includes("unreachable") ||
    text.includes("could not reach") ||
    text.includes("connection") ||
    text.includes("certificate")
  ) {
    return JOIN_OFFLINE;
  }
  return JOIN_GENERIC;
}
