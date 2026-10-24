import { setLegacyGymStatus } from "@fitplay/db";
import { subscriptionSchema } from "@fitplay/shared";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireSuperAdmin();
  if (!user?.sub) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID", "Choose a subscription status.");
  const { id } = await context.params;
  try {
    await setLegacyGymStatus({ id: user.sub, role: user.role }, id, parsed.data.subscriptionStatus);
  } catch (error) {
    return billingFailure(error);
  }
  return Response.json({ ok: true });
}
