import { auditAdminAction, setGameEnabled } from "@fitplay/db";
import { gameToggleSchema } from "@fitplay/shared";
import { requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireSuperAdmin();
  if (!user?.sub) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const parsed = gameToggleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID", "Missing enabled flag.");
  const { id } = await context.params;
  await setGameEnabled(id, parsed.data.enabled);
  await auditAdminAction({ id: user.sub, role: user.role }, "game.update", "Game", id, { enabled: parsed.data.enabled });
  return Response.json({ ok: true });
}
