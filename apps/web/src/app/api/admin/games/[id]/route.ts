import { setGameEnabled } from "@fitplay/db";
import { gameToggleSchema } from "@fitplay/shared";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser(["ADMIN"]);
  if (!user) return jsonError(403, "FORBIDDEN", "Admin access required.");
  const parsed = gameToggleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID", "Missing enabled flag.");
  const { id } = await context.params;
  await setGameEnabled(id, parsed.data.enabled);
  return Response.json({ ok: true });
}
