import { playDecisionForUser } from "@fitplay/db";
import { readUser } from "@/lib/auth";

export async function GET() {
  const session = await readUser();
  if (!session?.sub) return Response.json({ allowed: true, mode: "guest" });
  try {
    return Response.json(await playDecisionForUser(session.sub));
  } catch {
    return Response.json({
      allowed: false,
      reason: "suspended",
      message: "Play access could not be confirmed. Try again in a moment.",
    });
  }
}
