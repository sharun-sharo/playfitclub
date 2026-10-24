import { setSeatLimit } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const actor = await requireSuperAdmin();
  if (!actor?.sub) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const body = (await request.json().catch(() => null)) as { seatLimit?: number; planCode?: string } | null;
  if (!body?.seatLimit) return jsonError(400, "INVALID", "Enter a seat limit.");
  const { id } = await context.params;
  try {
    const seats = await setSeatLimit({ id: actor.sub, role: actor.role }, id, body.seatLimit, body.planCode);
    return Response.json({ ok: true, ...seats });
  } catch (error) {
    return billingFailure(error);
  }
}
