import { setGymSubscription } from "@fitplay/db";
import { subscriptionSchema } from "@fitplay/shared";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser(["ADMIN"]);
  if (!user) return jsonError(403, "FORBIDDEN", "Admin access required.");
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID", "Choose a subscription status.");
  const { id } = await context.params;
  await setGymSubscription(id, parsed.data.subscriptionStatus);
  return Response.json({ ok: true });
}
