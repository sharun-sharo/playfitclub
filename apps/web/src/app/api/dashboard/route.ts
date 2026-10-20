import { dashboardForUser, popularGames } from "@fitplay/db";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user?.sub) return jsonError(401, "UNAUTHORIZED", "Sign in to see your history.");
  const [dashboard, games] = await Promise.all([dashboardForUser(user.sub), popularGames()]);
  return Response.json({ ...dashboard, games });
}
