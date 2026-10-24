import { adminChangeMembership, listAssignmentGyms } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function GET() {
  const actor = await requireSuperAdmin();
  if (!actor) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  try {
    return Response.json({ gyms: await listAssignmentGyms() });
  } catch (error) {
    return billingFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const actor = await requireSuperAdmin();
  if (!actor?.sub) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const body = (await request.json().catch(() => null)) as { action?: string; userId?: string; gymId?: string } | null;
  if (!body?.userId || (body.action !== "assign" && body.action !== "transfer" && body.action !== "unassign")) {
    return jsonError(400, "INVALID", "Choose assign, transfer, or unassign, and a player.");
  }
  if (body.action !== "unassign" && !body.gymId) return jsonError(400, "INVALID", "Choose a gym.");
  try {
    const result = await adminChangeMembership(
      { id: actor.sub, role: actor.role },
      { action: body.action, userId: body.userId, gymId: body.gymId ?? null },
    );
    return Response.json(result);
  } catch (error) {
    return billingFailure(error);
  }
}
