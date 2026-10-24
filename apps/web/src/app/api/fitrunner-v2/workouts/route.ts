import { BillingError } from "@fitplay/db";
import { requireUser } from "@/lib/auth";
import { allowRequest, assertSameOrigin, jsonError } from "@/lib/http";
import { startWorkout } from "@/lib/fitrunner-v2/persist";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser();
  if (!user?.sub) return jsonError(401, "UNAUTHORIZED", "Sign in to save a workout.");
  if (!allowRequest(`workout-start:${user.sub}`, 20, 60_000)) return jsonError(429, "RATE_LIMITED", "Too many workout starts.");
  try {
    const workout = await startWorkout(user.sub);
    return Response.json({ ok: true, id: workout.id });
  } catch (error) {
    if (error instanceof BillingError) return jsonError(error.status, error.code, error.message);
    return jsonError(503, "UNAVAILABLE", "Workout storage is unavailable.");
  }
}
