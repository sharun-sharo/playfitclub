import { findUserByEmail } from "@fitplay/db";
import { writeSession } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";

const DEMOS = new Set(["admin@fitplay.dev", "owner@fitplay.dev", "player@fitplay.dev"]);

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return jsonError(404, "NOT_FOUND", "Not found.");
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email ?? "";
  if (!DEMOS.has(email)) return jsonError(400, "INVALID", "Unknown demo account.");
  const user = await findUserByEmail(email);
  if (!user?.email) return jsonError(404, "NOT_SEEDED", "Run the database seed before using demo sign-in.");
  if (user.accountStatus !== "ACTIVE") return jsonError(403, "SUSPENDED", "This account is deactivated.");
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
