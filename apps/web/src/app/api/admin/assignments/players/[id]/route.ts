import { playerAssignmentHistory } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { jsonError } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireSuperAdmin();
  if (!actor) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const { id } = await context.params;
  try {
    return Response.json({ history: await playerAssignmentHistory(id) });
  } catch (error) {
    return billingFailure(error);
  }
}
