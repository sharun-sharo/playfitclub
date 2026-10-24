import { setAccountStatus } from "@fitplay/db";
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
  const body = (await request.json().catch(() => null)) as { accountStatus?: "ACTIVE" | "SUSPENDED" } | null;
  if (body?.accountStatus !== "ACTIVE" && body?.accountStatus !== "SUSPENDED") return jsonError(400, "INVALID", "Choose active or suspended.");
  const { id } = await context.params;
  try {
    const user = await setAccountStatus({ id: actor.sub, role: actor.role }, id, body.accountStatus);
    return Response.json({ ok: true, user });
  } catch (error) {
    return billingFailure(error);
  }
}
