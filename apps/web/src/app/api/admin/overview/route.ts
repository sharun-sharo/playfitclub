import { adminOverview, listFlags, listGyms, listSessions, listUsers, popularGames } from "@fitplay/db";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await requireUser(["ADMIN"]);
  if (!user) return jsonError(403, "FORBIDDEN", "Admin access required.");
  const [overview, gyms, users, sessions, flags, games] = await Promise.all([
    adminOverview(),
    listGyms(),
    listUsers(),
    listSessions(),
    listFlags(),
    popularGames(),
  ]);
  return Response.json({ overview, gyms, users, sessions, flags, games });
}
