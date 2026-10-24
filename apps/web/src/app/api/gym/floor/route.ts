import { ownerFloor } from "@fitplay/db";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function GET() {
  const user = await requireUser(["GYM_OWNER"]);
  if (!user?.sub) return jsonError(403, "FORBIDDEN", "Only the gym owner can open this floor.");
  const floor = await ownerFloor(user.sub, user.role);
  if (!floor) return jsonError(403, "FORBIDDEN", "Only the gym owner can open this floor.");
  return Response.json(floor);
}
