import { gymAssignmentDetail } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { jsonError } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireSuperAdmin();
  if (!actor) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const { id } = await context.params;
  try {
    const gym = await gymAssignmentDetail(id);
    if (!gym) return jsonError(404, "NOT_FOUND", "Gym not found.");
    return Response.json({ gym });
  } catch (error) {
    return billingFailure(error);
  }
}
