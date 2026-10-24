import { changePassword } from "@fitplay/db";
import { BillingError } from "@fitplay/db";
import { readAccountSession, writeSession } from "@/lib/auth";
import { allowRequest, assertSameOrigin, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const session = await readAccountSession();
  if (!session) return jsonError(401, "UNAUTHORIZED", "Sign in again before changing the password.");
  if (!allowRequest(`password:${session.record.id}`, 8, 15 * 60_000)) return jsonError(429, "RATE_LIMITED", "Too many password attempts.");
  const body = (await request.json().catch(() => null)) as { currentPassword?: string; newPassword?: string } | null;
  if (!body?.currentPassword || !body.newPassword) return jsonError(400, "INVALID", "Enter the current password and a new password.");
  try {
    const updated = await changePassword(session.record.id, { currentPassword: body.currentPassword, newPassword: body.newPassword });
    if (!updated.email) return jsonError(400, "INVALID", "This account has no email.");
    await writeSession({
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      sessionVersion: updated.sessionVersion,
      mustChangePassword: updated.mustChangePassword,
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof BillingError) return jsonError(error.status, error.code, error.message);
    return jsonError(503, "UNAVAILABLE", "The password could not be changed.");
  }
}
