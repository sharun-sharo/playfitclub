import { provisionGymMember } from "@fitplay/db";
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
  const body = (await request.json().catch(() => null)) as { email?: string; displayName?: string } | null;
  if (!body?.email || !body.displayName) return jsonError(400, "INVALID", "Enter the member email and name.");
  const { id } = await context.params;
  try {
    const member = await provisionGymMember({ id: actor.sub, role: actor.role }, id, { email: body.email, displayName: body.displayName });
    return Response.json({ ok: true, ...member });
  } catch (error) {
    return billingFailure(error);
  }
}
