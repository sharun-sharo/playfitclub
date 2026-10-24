import { createGymAccount, listGymBilling } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function GET() {
  const actor = await requireSuperAdmin();
  if (!actor) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  try {
    return Response.json({ gyms: await listGymBilling() });
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
  const body = (await request.json().catch(() => null)) as { name?: string; ownerEmail?: string; ownerName?: string; seatLimit?: number; planCode?: string } | null;
  if (!body?.name || !body.ownerEmail || !body.ownerName || !body.seatLimit) return jsonError(400, "INVALID", "Enter the gym, owner, and seat limit.");
  try {
    const created = await createGymAccount(
      { id: actor.sub, role: actor.role },
      { name: body.name, ownerEmail: body.ownerEmail, ownerName: body.ownerName, seatLimit: body.seatLimit, planCode: body.planCode },
    );
    return Response.json({ ok: true, ...created });
  } catch (error) {
    return billingFailure(error);
  }
}
