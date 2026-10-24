import { gymForOwner, updateGymBranding } from "@fitplay/db";
import { brandingSchema } from "@fitplay/shared";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, jsonError } from "@/lib/http";

export async function GET() {
  const user = await requireUser();
  if (!user?.sub) return jsonError(401, "UNAUTHORIZED", "Sign in required.");
  const gym = await gymForOwner(user.sub);
  if (!gym) return Response.json({ gym: null, isOwner: false });
  return Response.json({ gym, isOwner: gym.ownerId === user.sub });
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const user = await requireUser(["GYM_OWNER", "ADMIN"]);
  if (!user?.sub) return jsonError(403, "FORBIDDEN", "Only a gym owner can change branding.");
  const gym = await gymForOwner(user.sub);
  if (!gym || gym.ownerId !== user.sub) return jsonError(403, "FORBIDDEN", "Only the gym owner can change branding.");
  const parsed = brandingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "INVALID", "Check the gym name, tagline, accent color, and logo text.");
  await updateGymBranding(gym.id, {
    name: parsed.data.name,
    branding: { tagline: parsed.data.tagline, accent: parsed.data.accent, logoText: parsed.data.logoText },
  });
  return Response.json({ ok: true });
}
