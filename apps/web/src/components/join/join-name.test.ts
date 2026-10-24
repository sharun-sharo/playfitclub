import { describe, expect, it } from "vitest";
import {
  JOIN_EXPIRED,
  JOIN_FULL,
  JOIN_GENERIC,
  JOIN_INVALID,
  JOIN_NAME_CHARS,
  JOIN_NAME_LONG,
  JOIN_NAME_REQUIRED,
  JOIN_NAME_SHORT,
  JOIN_OFFLINE,
  JOIN_STARTED,
  JOIN_WAIT,
  friendlyJoinError,
  joinNameMessage,
} from "./join-name";

describe("join name", () => {
  it("asks for a visible name and matches the 2–18 join limit", () => {
    expect(joinNameMessage("")).toBe(JOIN_NAME_REQUIRED);
    expect(joinNameMessage("   ")).toBe(JOIN_NAME_REQUIRED);
    expect(joinNameMessage(" A ")).toBe(JOIN_NAME_SHORT);
    expect(joinNameMessage("A".repeat(19))).toBe(JOIN_NAME_LONG);
    expect(joinNameMessage("Ria!")).toBe(JOIN_NAME_CHARS);
    expect(joinNameMessage("  Ria  ")).toBeNull();
    expect(joinNameMessage("A".repeat(18))).toBeNull();
  });

  it("maps session failures to short copy without codes", () => {
    expect(friendlyJoinError("INVALID_CODE", "That session code does not exist.")).toBe(JOIN_INVALID);
    expect(friendlyJoinError("EXPIRED", "This session has expired. Start a new one on the TV.")).toBe(JOIN_EXPIRED);
    expect(friendlyJoinError("SESSION_FULL", "This TV already has the maximum number of players.")).toBe(JOIN_FULL);
    expect(friendlyJoinError(undefined, "The live game is unreachable.")).toBe(JOIN_OFFLINE);
    expect(friendlyJoinError("NOT_JOINABLE", "This game has already started.")).toBe(JOIN_STARTED);
    expect(friendlyJoinError("RATE_LIMITED", "Too many join attempts. Wait a minute.")).toBe(JOIN_WAIT);
    expect(friendlyJoinError("JOIN_FAILED", "Could not join")).toBe(JOIN_GENERIC);
    expect(friendlyJoinError("INVALID_CODE", "That session code does not exist.")).not.toMatch(/INVALID_CODE|[A-Z2-9]{6}/);
  });
});
