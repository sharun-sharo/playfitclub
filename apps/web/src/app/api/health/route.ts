import { databaseHealthy } from "@fitplay/db";
import { serverEnv } from "@/lib/env";

export async function GET() {
  const database = await databaseHealthy();
  let realtime = false;
  try {
    const response = await fetch(`${serverEnv().realtimeUrl}/health`, { cache: "no-store" });
    realtime = response.ok;
  } catch {
    realtime = false;
  }
  return Response.json({ ok: database, database, realtime, service: "fitplay-web" }, { status: database ? 200 : 503 });
}
