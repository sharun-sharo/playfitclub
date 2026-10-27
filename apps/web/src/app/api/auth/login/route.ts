import { findUserByEmail } from "@fitplay/db";
import { loginSchema } from "@fitplay/shared";
import bcrypt from "bcryptjs";
import { writeSession } from "@/lib/auth";
import { allowRequest, assertSameOrigin, jsonError, requestIp } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID", "Enter a valid email and a password of at least 6 characters.");
  const email = parsed.data.email.toLowerCase();
  if (!allowRequest(`login:${requestIp(request)}`, 12, 60_000) || !allowRequest(`login-email:${email}`, 8, 15 * 60_000)) {
    return jsonError(429, "RATE_LIMITED", "Too many sign-in attempts.");
  }
  const user = await findUserByEmail(email);
  if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash)) || !user.email) {
    return jsonError(401, "INVALID_LOGIN", "Email or password is incorrect.");
  }
  if (user.accountStatus !== "ACTIVE") return jsonError(403, "SUSPENDED", "This account is deactivated. Contact the PlayFit Club team.");
  await writeSession({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    sessionVersion: user.sessionVersion,
    mustChangePassword: user.mustChangePassword,
  });
  return Response.json({ ok: true, role: user.role, mustChangePassword: user.mustChangePassword });
}
