import { requireUser } from "@/lib/auth";
import { allowRequest, assertSameOrigin, jsonError } from "@/lib/http";
import { completeWorkout, pauseWorkout, resumeWorkout } from "@/lib/fitrunner-v2/persist";
import { clientResultField } from "@/lib/fitrunner-v2/workout";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser();
  if (!user?.sub) return jsonError(401, "UNAUTHORIZED", "Sign in to save a workout.");
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: string; score?: unknown; xp?: unknown; calories?: unknown } | null;
  if (!body || typeof body !== "object") return jsonError(400, "INVALID", "Send an action.");
  if (clientResultField(body)) {
    return jsonError(400, "REJECTED", "Score, XP, calories, and mission completion are calculated by the server.");
  }
  if (!allowRequest(`workout-state:${user.sub}`, 60, 60_000)) return jsonError(429, "RATE_LIMITED", "Too many workout updates.");
  try {
    const result =
      body.action === "pause" ? await pauseWorkout(user.sub, id)
      : body.action === "resume" ? await resumeWorkout(user.sub, id)
      : body.action === "complete" ? await completeWorkout(user.sub, id)
      : null;
    if (!result) return jsonError(400, "INVALID", "Use pause, resume, or complete.");
    if (!result.ok) return jsonError(result.status, "WORKOUT", result.message);
    return Response.json(result);
  } catch {
    return jsonError(503, "UNAVAILABLE", "Workout storage is unavailable.");
  }
}
