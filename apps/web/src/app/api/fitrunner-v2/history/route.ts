import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { listWorkoutHistory } from "@/lib/fitrunner-v2/persist";
import { historyForViewer } from "@/lib/fitrunner-v2/workout";

export async function GET() {
  const user = await requireUser();
  const rows = user?.sub ? await listWorkoutHistory(user.sub).catch(() => null) : [];
  if (rows === null) return jsonError(503, "UNAVAILABLE", "History is unavailable.");
  const visible = historyForViewer(user?.sub ?? null, rows);
  if (visible.status === 401) return jsonError(401, "UNAUTHORIZED", "Sign in to see your workouts.");
  return Response.json({ ok: true, workouts: visible.rows });
}
