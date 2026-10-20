import { gymForOwner } from "@fitplay/db";
import { signClaims } from "@fitplay/shared";
import { readUser } from "@/lib/auth";
import { serverEnv } from "@/lib/env";

export async function GET() {
  const user = await readUser();
  if (!user?.sub) return Response.json({ user: null });
  const gym = await gymForOwner(user.sub);
  const socketToken = await signClaims(
    { kind: "user", sub: user.sub, email: user.email, name: user.name, role: user.role },
    serverEnv().secret,
    "2h",
  );
  return Response.json({
    user: { id: user.sub, email: user.email, displayName: user.name, role: user.role },
    gym,
    socketToken,
  });
}
