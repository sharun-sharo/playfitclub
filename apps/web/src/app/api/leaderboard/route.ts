import { leaderboard } from "@fitplay/db";

export async function GET() {
  return Response.json({ entries: await leaderboard() });
}
