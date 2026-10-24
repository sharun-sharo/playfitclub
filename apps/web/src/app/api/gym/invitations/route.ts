import { createOwnerInvitation, gymInviteState } from "@fitplay/db";
import { billingFailure } from "@/lib/billing-http";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function GET() {
  const user = await requireUser(["GYM_OWNER", "ADMIN"]);
  if (!user?.sub) return jsonError(403, "FORBIDDEN", "Only a gym owner can view invitations.");
  const state = await gymInviteState(user.sub);
  if (!state) return jsonError(403, "FORBIDDEN", "Only the gym owner can view this gym.");
  return Response.json(state);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser(["GYM_OWNER"]);
  if (!user?.sub) return jsonError(403, "FORBIDDEN", "Only a gym owner can invite members.");
  const body = (await request.json().catch(() => null)) as { email?: string; gymId?: string } | null;
  if (!body?.email) return jsonError(400, "INVALID", "Enter the member email.");
  if (body.gymId) {
    const state = await gymInviteState(user.sub);
    if (!state || state.gymId !== body.gymId) return jsonError(403, "FORBIDDEN", "You can invite members only for your gym.");
  }
  try {
    const invite = await createOwnerInvitation({ id: user.sub, role: user.role }, body.email);
    return Response.json({ ok: true, ...invite, note: "An invitation does not start play. The gym subscription must be active, a seat must be free, and the member must be linked." });
  } catch (error) {
    return billingFailure(error);
  }
}
