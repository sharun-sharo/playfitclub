export function clientEnv() {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "",
    realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL?.replace(/\/$/, "") || "http://127.0.0.1:3001",
  };
}

/**
 * Browser Socket.IO target.
 * Local dev uses the page origin. Next proxies `/socket.io` to the realtime process,
 * so the laptop does not need a second certificate for port 3001.
 * Production returns NEXT_PUBLIC_REALTIME_URL unchanged, including a separate host.
 */
export function browserRealtimeUrl(pageOrigin: string) {
  return resolveBrowserRealtimeUrl({
    pageOrigin,
    configuredUrl: clientEnv().realtimeUrl,
    production: process.env.NODE_ENV === "production",
  });
}

export function resolveBrowserRealtimeUrl(input: { pageOrigin: string; configuredUrl: string; production: boolean }) {
  const configured = input.configuredUrl.replace(/\/$/, "");
  if (input.production) return configured;
  try {
    return new URL(input.pageOrigin).origin;
  } catch {
    return configured;
  }
}

/** True when the browser socket stays on the page the user already opened. */
export function socketUsesPageOrigin(pageOrigin: string) {
  try {
    return new URL(browserRealtimeUrl(pageOrigin)).origin === new URL(pageOrigin).origin;
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
