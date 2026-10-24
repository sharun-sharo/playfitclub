import { requireUser } from "@/lib/auth";
import { allowRequest, assertSameOrigin, jsonError } from "@/lib/http";
import { claimMission } from "@/lib/fitrunner-v2/persist";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser();
  if (!user?.sub) return jsonError(401, "UNAUTHORIZED", "Sign in to claim a mission.");
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if ("xp" in body || "score" in body || "calories" in body) {
    return jsonError(400, "REJECTED", "XP is granted by the server.");
  }
  if (!allowRequest(`mission-claim:${user.sub}`, 30, 60_000)) return jsonError(429, "RATE_LIMITED", "Too many claim attempts.");
  try {
    const result = await claimMission(user.sub, id);
    if (!result.ok) return jsonError(result.status, "MISSION", result.message);
    return Response.json(result);
  } catch {
    return jsonError(503, "UNAVAILABLE", "Missions are unavailable.");
  }
}
