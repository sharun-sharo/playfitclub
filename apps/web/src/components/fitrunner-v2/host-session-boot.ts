export const HOST_TOKEN_KEY = "fitplay.host.token";

export type HostBootPlan =
  | { kind: "create" }
  | { kind: "resume"; token: string }
  | { kind: "retire"; token: string };

/**
 * A browser load has no in-memory page token, so a stored host token must not
 * be shown again. It only identifies the previous page's session so that load
 * can close it. Play Again and a socket reconnect pass the token minted for
 * this document and keep that session.
 */
export function hostBootAction(input: { pageToken?: string | null; storedToken?: string | null }): HostBootPlan {
  const pageToken = present(input.pageToken);
  const storedToken = present(input.storedToken);
  if (pageToken) return { kind: "resume", token: pageToken };
  if (storedToken) return { kind: "retire", token: storedToken };
  return { kind: "create" };
}

/** Ignore broadcasts from a session this page has not minted, including the one being closed. */
export function shouldApplyHostSession(acceptedSessionId: string, incomingSessionId: string | undefined) {
  return acceptedSessionId.length > 0 && incomingSessionId === acceptedSessionId;
}

export function readStoredHostToken(storage: { getItem(key: string): string | null } | null | undefined) {
  if (!storage) return null;
  try {
    return present(storage.getItem(HOST_TOKEN_KEY)) || null;
  } catch {
    return null;
  }
}

export function clearStoredHostToken(storage: { removeItem(key: string): void } | null | undefined) {
  if (!storage) return;
  try {
    storage.removeItem(HOST_TOKEN_KEY);
  } catch {
    // Storage can be blocked. This page still mints a session in memory.
  }
}

export function writeStoredHostToken(storage: { setItem(key: string, value: string): void } | null | undefined, token: string) {
  const value = present(token);
  if (!storage || !value) return;
  try {
    storage.setItem(HOST_TOKEN_KEY, value);
  } catch {
    // The in-memory token still keeps this document on the same session.
  }
}

function present(value: string | null | undefined) {
  if (typeof value !== "string") return "";
  return value.trim();
}
