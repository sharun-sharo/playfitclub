import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { ensureMissions } from "@/lib/fitrunner-v2/persist";

export async function GET() {
  const user = await requireUser();
  if (!user?.sub) return jsonError(401, "UNAUTHORIZED", "Sign in to see daily missions.");
  try {
    const board = await ensureMissions(user.sub);
    return Response.json({ ok: true, ...board });
  } catch {
    return jsonError(503, "UNAVAILABLE", "Missions are unavailable.");
  }
}
