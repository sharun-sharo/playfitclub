import { acceptInvitation, BillingError } from "@fitplay/db";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser();
  if (!user?.sub || !user.email) return jsonError(401, "UNAUTHORIZED", "Sign in with the invited email. This page does not create an account.");
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return jsonError(400, "INVALID", "This invitation link is incomplete.");
  try {
    const result = await acceptInvitation({ id: user.sub, email: user.email, role: user.role }, body.token);
    return Response.json({
      ok: true,
      ...result,
      message: result.playGranted
        ? "You are linked to the gym. Play is available while that gym subscription stays active."
        : "You are linked to the gym. Play stays closed until the PlayFit Club team activates the gym subscription.",
    });
  } catch (error) {
    if (error instanceof BillingError) return jsonError(error.status, error.code, error.message);
    return jsonError(503, "UNAVAILABLE", "The invitation could not be accepted.");
  }
}
