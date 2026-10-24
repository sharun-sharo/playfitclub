import { auditAdminAction, setFlag } from "@fitplay/db";
import { flagSchema } from "@fitplay/shared";
import { requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireSuperAdmin();
  if (!user?.sub) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const parsed = flagSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID", "Missing enabled flag.");
  const { key } = await context.params;
  await setFlag(key, parsed.data.enabled);
  await auditAdminAction({ id: user.sub, role: user.role }, "flag.update", "FeatureFlag", key, { enabled: parsed.data.enabled });
  return Response.json({ ok: true });
}
