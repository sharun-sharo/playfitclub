import { addGymStaff, gymForOwner } from "@fitplay/db";
import { staffSchema } from "@fitplay/shared";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser(["GYM_OWNER", "ADMIN"]);
  if (!user?.sub) return jsonError(403, "FORBIDDEN", "Only a gym owner can manage staff.");
  const gym = await gymForOwner(user.sub);
  if (!gym || gym.ownerId !== user.sub) return jsonError(403, "FORBIDDEN", "Only the gym owner can manage staff.");
  const parsed = staffSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID", "Enter an existing member email.");
  const added = await addGymStaff(gym.id, parsed.data.email, parsed.data.role);
  if (!added) return jsonError(404, "NOT_FOUND", "That person needs a PlayFit Club account before they can join the gym.");
  return Response.json({ ok: true });
}
