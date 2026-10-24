import { describe, expect, it } from "vitest";
import {
  HOST_TOKEN_KEY,
  clearStoredHostToken,
  hostBootAction,
  readStoredHostToken,
  shouldApplyHostSession,
  writeStoredHostToken,
} from "./host-session-boot";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = { ...initial };
  return {
    values,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key]! : null;
    },
    setItem(key: string, value: string) {
      values[key] = value;
    },
    removeItem(key: string) {
      delete values[key];
    },
  };
}

describe("host session boot", () => {
  it("retires a stored host token on a full page load instead of showing it again", () => {
    const storage = memoryStorage({ [HOST_TOKEN_KEY]: "previous-page-token" });
    const stored = readStoredHostToken(storage);
    expect(HOST_TOKEN_KEY).toBe("fitplay.host.token");
    expect(hostBootAction({ pageToken: null, storedToken: stored })).toEqual({
      kind: "retire",
      token: "previous-page-token",
    });
    expect(shouldApplyHostSession("", "previous-session")).toBe(false);
  });

  it("mints a session when this browser has nothing stored", () => {
    expect(hostBootAction({ pageToken: null, storedToken: readStoredHostToken(memoryStorage()) })).toEqual({ kind: "create" });
    expect(hostBootAction({ pageToken: "  ", storedToken: "" })).toEqual({ kind: "create" });
  });

  it("keeps the session minted on this page for Play Again and socket reconnects", () => {
    const storage = memoryStorage();
    writeStoredHostToken(storage, "this-page-token");
    expect(storage.values[HOST_TOKEN_KEY]).toBe("this-page-token");
    expect(hostBootAction({ pageToken: "this-page-token", storedToken: readStoredHostToken(storage) })).toEqual({
      kind: "resume",
      token: "this-page-token",
    });
    expect(shouldApplyHostSession("session-live", "session-live")).toBe(true);
    expect(shouldApplyHostSession("session-live", "session-old")).toBe(false);
  });

  it("drops the stored token once this load has taken it", () => {
    const storage = memoryStorage({ [HOST_TOKEN_KEY]: "previous-page-token" });
    clearStoredHostToken(storage);
    expect(readStoredHostToken(storage)).toBeNull();
    expect(hostBootAction({ pageToken: null, storedToken: null })).toEqual({ kind: "create" });
  });
});
