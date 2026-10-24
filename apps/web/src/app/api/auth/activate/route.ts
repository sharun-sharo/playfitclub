import { BillingError, redeemActivationToken } from "@fitplay/db";
import { writeSession } from "@/lib/auth";
import { allowRequest, assertSameOrigin, jsonError, requestIp } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  if (!allowRequest(`activate:${requestIp(request)}`, 8, 15 * 60_000)) return jsonError(429, "RATE_LIMITED", "Too many activation attempts.");
  const body = (await request.json().catch(() => null)) as { token?: string; newPassword?: string } | null;
  if (!body?.token || !body.newPassword) return jsonError(400, "INVALID", "Use the link from the PlayFit Club team and choose a new password.");
  try {
    const updated = await redeemActivationToken({ token: body.token, newPassword: body.newPassword });
    if (!updated.email) return jsonError(400, "INVALID", "This account has no email.");
    await writeSession({
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      sessionVersion: updated.sessionVersion,
      mustChangePassword: false,
    });
    return Response.json({ ok: true, role: updated.role });
  } catch (error) {
    if (error instanceof BillingError) return jsonError(error.status, error.code, error.message);
    return jsonError(503, "UNAVAILABLE", "The link could not be used.");
  }
}
