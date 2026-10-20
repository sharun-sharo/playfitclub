import { setFlag } from "@fitplay/db";
import { flagSchema } from "@fitplay/shared";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser(["ADMIN"]);
  if (!user) return jsonError(403, "FORBIDDEN", "Admin access required.");
  const parsed = flagSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID", "Missing enabled flag.");
  const { key } = await context.params;
  await setFlag(key, parsed.data.enabled);
  return Response.json({ ok: true });
}
