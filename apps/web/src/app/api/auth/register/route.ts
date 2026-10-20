import { createUser, findUserByEmail } from "@fitplay/db";
import { registerSchema } from "@fitplay/shared";
import bcrypt from "bcryptjs";
import { writeSession } from "@/lib/auth";
import { allowRequest, assertSameOrigin, jsonError, requestIp } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  if (!allowRequest(`register:${requestIp(request)}`, 8, 60_000)) return jsonError(429, "RATE_LIMITED", "Too many accounts were created from this network.");
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID", "Use a valid email, a display name, and a password of at least 8 characters.");
  if (await findUserByEmail(parsed.data.email)) return jsonError(409, "EXISTS", "An account with that email already exists.");
  const user = await createUser({
    email: parsed.data.email,
    displayName: parsed.data.displayName,
    passwordHash: await bcrypt.hash(parsed.data.password, 10),
    role: "PLAYER",
  });
  await writeSession({ id: user.id, email: user.email ?? parsed.data.email, displayName: user.displayName, role: user.role });
  return Response.json({ ok: true });
}
