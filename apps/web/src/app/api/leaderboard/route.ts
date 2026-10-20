import { leaderboard } from "@fitplay/db";

export async function GET(request: Request) {
  const gymId = new URL(request.url).searchParams.get("gymId") ?? undefined;
  return Response.json({ entries: await leaderboard(gymId) });
}
