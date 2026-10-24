import { requireUser } from "@/lib/auth";
import { allowRequest, assertSameOrigin, jsonError } from "@/lib/http";
import { readProfile, writeProfile } from "@/lib/fitrunner-v2/persist";

export async function GET() {
  const user = await requireUser();
  if (!user?.sub) return jsonError(401, "UNAUTHORIZED", "Sign in to see your profile.");
  try {
    return Response.json({ ok: true, profile: await readProfile(user.sub) });
  } catch {
    return jsonError(503, "UNAVAILABLE", "Profile storage is unavailable.");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser();
  if (!user?.sub) return jsonError(401, "UNAUTHORIZED", "Sign in to update your profile.");
  if (!allowRequest(`profile:${user.sub}`, 20, 60_000)) return jsonError(429, "RATE_LIMITED", "Too many profile updates.");
  const body = await request.json().catch(() => null);
  try {
    const result = await writeProfile(user.sub, body);
    if (!result.ok) return jsonError(result.status, "PROFILE", result.message);
    return Response.json(result);
  } catch {
    return jsonError(503, "UNAVAILABLE", "Profile storage is unavailable.");
  }
}
