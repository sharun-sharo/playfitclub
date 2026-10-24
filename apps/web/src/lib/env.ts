/** Shown when production has no public realtime host. Never names a local port. */
export const GAME_SERVER_DISCONNECTED = "The game server is not connected.";

const DEV_REALTIME_URL = "http://127.0.0.1:3001";

export function clientEnv() {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL?.replace(/\/$/, "") ?? "";
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "",
    realtimeUrl: configured || (process.env.NODE_ENV === "production" ? "" : DEV_REALTIME_URL),
  };
}

export type BrowserRealtimeConnection = { ok: true; url: string } | { ok: false; reason: "unconfigured" };

/**
 * Browser Socket.IO target.
 * Local dev uses the page origin. Next proxies `/socket.io` to the realtime process,
 * so the laptop does not need a second certificate for port 3001.
 * Production uses NEXT_PUBLIC_REALTIME_URL as its own origin.
 * A missing or loopback value is refused. It is not rewritten onto the page host.
 */
export function browserRealtimeConnection(pageOrigin: string): BrowserRealtimeConnection {
  return resolveBrowserRealtimeConnection({
    pageOrigin,
    configuredUrl: clientEnv().realtimeUrl,
    production: process.env.NODE_ENV === "production",
  });
}

export function resolveBrowserRealtimeConnection(input: {
  pageOrigin: string;
  configuredUrl: string;
  production: boolean;
}): BrowserRealtimeConnection {
  const configured = input.configuredUrl.trim().replace(/\/$/, "");
  if (input.production) {
    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      return { ok: false, reason: "unconfigured" };
    }
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || isLoopbackRealtimeUrl(configured)) {
      return { ok: false, reason: "unconfigured" };
    }
    return { ok: true, url: configured };
  }
  try {
    return { ok: true, url: new URL(input.pageOrigin).origin };
  } catch {
    if (!configured) return { ok: false, reason: "unconfigured" };
    return { ok: true, url: configured };
  }
}

export function browserRealtimeUrl(pageOrigin: string) {
  return resolveBrowserRealtimeUrl({
    pageOrigin,
    configuredUrl: clientEnv().realtimeUrl,
    production: process.env.NODE_ENV === "production",
  });
}

export function resolveBrowserRealtimeUrl(input: { pageOrigin: string; configuredUrl: string; production: boolean }) {
  const decision = resolveBrowserRealtimeConnection(input);
  if (decision.ok) return decision.url;
  throw new Error("NEXT_PUBLIC_REALTIME_URL must be a public origin in production.");
}

/** True when the browser socket stays on the page the user already opened. */
export function socketUsesPageOrigin(pageOrigin: string) {
  try {
    return new URL(browserRealtimeUrl(pageOrigin)).origin === new URL(pageOrigin).origin;
  } catch {
    return false;
  }
}

/** localhost, ::1, and 127.0.0.0/8. Empty or unparseable values are not loopback hosts. */
export function isLoopbackRealtimeUrl(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (host === "localhost" || host === "::1") return true;
    const parts = host.split(".").map((part) => Number(part));
    return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) && parts[0] === 127;
  } catch {
    return false;
  }
}

/** A private realtime host may be using the local dev certificate. A public https host does not. */
export function devCertificateHost(realtimeUrl: string) {
  try {
    return isPrivateDevHost(new URL(realtimeUrl).hostname);
  } catch {
    return false;
  }
}

/** Loopback and private hosts are this machine during local dev. */
export function isPrivateDevHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  const parts = host.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/**
 * Where the Next dev server dials the realtime process.
 * A private REALTIME_URL is reached on loopback so the proxy does not depend on the LAN address.
 */
export function devRealtimeProxyOrigin(configured: string) {
  const url = new URL(configured);
  if (isPrivateDevHost(url.hostname)) url.hostname = "127.0.0.1";
  return url.origin;
}

export function serverEnv() {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters");
  }
  return {
    secret,
    realtimeUrl: process.env.REALTIME_URL?.replace(/\/$/, "") || "http://127.0.0.1:3001",
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "",
    production: process.env.NODE_ENV === "production",
    allowShortSessions: process.env.ALLOW_SHORT_SESSIONS === "true",
  };
}
