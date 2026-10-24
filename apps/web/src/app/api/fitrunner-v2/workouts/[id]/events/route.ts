import { assertCanStartGameplay, BillingError } from "@fitplay/db";
import { requireUser } from "@/lib/auth";
import { allowRequest, assertSameOrigin, jsonError } from "@/lib/http";
import { appendWorkoutEvents } from "@/lib/fitrunner-v2/persist";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser();
  if (!user?.sub) return jsonError(401, "UNAUTHORIZED", "Sign in to save a workout.");
  try {
    await assertCanStartGameplay(user.sub);
  } catch (error) {
    if (error instanceof BillingError) return jsonError(error.status, error.code, error.message);
    return jsonError(403, "PLAY_BLOCKED", "Play is not available on this account.");
  }
  const { id } = await context.params;
  if (!allowRequest(`workout-events:${user.sub}`, 120, 60_000)) return jsonError(429, "RATE_LIMITED", "Too many event batches.");
  const body = await request.json().catch(() => null);
  try {
    const result = await appendWorkoutEvents(user.sub, id, body);
    if (!result.ok) return jsonError(result.status, "EVENTS", result.message);
    return Response.json(result);
  } catch {
    return jsonError(503, "UNAVAILABLE", "Workout storage is unavailable.");
  }
}
