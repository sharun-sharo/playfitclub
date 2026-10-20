export function log(level: "info" | "warn" | "error", message: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, service: "fitplay-realtime", message, ...fields }));
}
