export function clientEnv() {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "",
    realtimeUrl: process.env.NEXT_PUBLIC_REALTIME_URL?.replace(/\/$/, "") || "http://127.0.0.1:3001",
  };
}

/** Uses the page hostname so localhost and the phone address each reach their own game server. */
export function browserRealtimeUrl(pageOrigin: string) {
  const configured = clientEnv().realtimeUrl;
  try {
    const target = new URL(configured);
    const page = new URL(pageOrigin);
    target.protocol = page.protocol;
    target.hostname = page.hostname;
    return target.toString().replace(/\/$/, "");
  } catch {
    return configured;
  }
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
