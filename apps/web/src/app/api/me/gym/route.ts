import { playerHome } from "@fitplay/db";
import { requireUser } from "@/lib/auth";
import { boardPeriod, gameFilter } from "@/lib/gym-http";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  const user = await requireUser();
  if (!user?.sub) return jsonError(401, "UNAUTHORIZED", "Sign in to see your gym.");
  const url = new URL(request.url);
  const home = await playerHome(user.sub, {
    period: boardPeriod(url.searchParams.get("period")),
    gameId: await gameFilter(url.searchParams.get("game")),
    requestedGymId: url.searchParams.get("gymId"),
  });
  return Response.json(home);
}
