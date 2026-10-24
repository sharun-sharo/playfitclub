import { billingOverview, listAudit } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await requireSuperAdmin();
  if (!user) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  try {
    const [overview, audit] = await Promise.all([billingOverview(), listAudit(30)]);
    return Response.json({ overview, audit });
  } catch (error) {
    return billingFailure(error);
  }
}
