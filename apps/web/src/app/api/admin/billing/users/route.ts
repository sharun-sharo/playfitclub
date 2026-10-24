import { createProvisionedUser, searchUsers } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function GET(request: Request) {
  const user = await requireSuperAdmin();
  if (!user) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const url = new URL(request.url);
  try {
    const users = await searchUsers({
      q: url.searchParams.get("q") ?? undefined,
      role: url.searchParams.get("role") ?? undefined,
      plan: url.searchParams.get("plan") ?? undefined,
      accountStatus: url.searchParams.get("status") ?? undefined,
      subscriptionStatus: url.searchParams.get("subscription") ?? undefined,
    });
    return Response.json({ users });
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
  const body = (await request.json().catch(() => null)) as { email?: string; displayName?: string; role?: "INDIVIDUAL" | "GYM_OWNER" | "SUPER_ADMIN" } | null;
  if (!body?.email || !body.displayName || !body.role) return jsonError(400, "INVALID", "Enter an email, a name, and a role.");
  if (!["INDIVIDUAL", "GYM_OWNER", "SUPER_ADMIN"].includes(body.role)) return jsonError(400, "INVALID", "Choose a role.");
  try {
    const created = await createProvisionedUser({ id: actor.sub, role: actor.role }, { email: body.email, displayName: body.displayName, role: body.role });
    return Response.json({ ok: true, ...created });
  } catch (error) {
    return billingFailure(error);
  }
}
