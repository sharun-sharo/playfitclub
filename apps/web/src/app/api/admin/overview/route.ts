import { adminOverview, billingOverview, listFlags, listGyms, listSessions, listUsers, popularGames } from "@fitplay/db";
import { requireSuperAdmin } from "@/lib/billing-http";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const [overview, gyms, users, sessions, flags, games] = await Promise.all([
    adminOverview(),
    listGyms(),
    listUsers(),
    listSessions(),
    listFlags(),
    popularGames(),
  ]);
  let billing = null;
  try {
    billing = await billingOverview();
  } catch {
    billing = null;
  }
  return Response.json({ overview, billing, gyms, users, sessions, flags, games });
}
