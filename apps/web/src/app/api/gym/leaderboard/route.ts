import { ownerBoard } from "@fitplay/db";
import { requireUser } from "@/lib/auth";
import { boardPeriod, gameFilter } from "@/lib/gym-http";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  const user = await requireUser(["GYM_OWNER"]);
  if (!user?.sub) return jsonError(403, "FORBIDDEN", "Only the gym owner can open this leaderboard.");
  const url = new URL(request.url);
  const board = await ownerBoard(user.sub, user.role, boardPeriod(url.searchParams.get("period")), await gameFilter(url.searchParams.get("game")));
  if (!board) return jsonError(403, "FORBIDDEN", "Only the gym owner can open this leaderboard.");
  return Response.json(board);
}
