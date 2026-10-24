import { resetCredentials } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const actor = await requireSuperAdmin();
  if (!actor?.sub) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const { id } = await context.params;
  try {
    const result = await resetCredentials({ id: actor.sub, role: actor.role }, id);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return billingFailure(error);
  }
}
