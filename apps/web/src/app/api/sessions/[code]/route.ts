import { createPrismaRepository } from "@fitplay/db";
import { joinCodeSchema } from "@fitplay/shared";
import { jsonError } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const parsed = joinCodeSchema.safeParse(code);
  if (!parsed.success) return jsonError(400, "INVALID_CODE", "Session codes are 6 characters.");
  const session = await createPrismaRepository().findByCode(parsed.data);
  if (!session) return jsonError(404, "INVALID_CODE", "That session code does not exist.");
  if (session.status === "EXPIRED" || session.status === "CLOSED" || new Date(session.expiresAt).getTime() <= Date.now()) {
    return jsonError(410, "EXPIRED", "This session has expired.");
  }
  return Response.json({
    ok: true,
    session: {
      gameName: session.gameName,
      status: session.status,
      playerCount: session.players.length,
      maxPlayers: session.maxPlayers,
      gymName: session.gymName,
      expiresAt: session.expiresAt,
    },
  });
}
