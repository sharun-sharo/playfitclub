import { cookies } from "next/headers";
import { signClaims, verifyClaims, type UserClaims, type UserRole } from "@fitplay/shared";
import { serverEnv } from "./env";

export const SESSION_COOKIE = "fitplay_session";

export async function readUser(): Promise<UserClaims | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const claims = await verifyClaims<UserClaims>(token, serverEnv().secret);
    if (claims.kind !== "user" || !claims.sub) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function requireUser(roles?: UserRole[]) {
  const user = await readUser();
  if (!user) return null;
  if (roles && !roles.includes(user.role)) return null;
  return user;
}

export async function writeSession(user: { id: string; email: string; displayName: string; role: UserRole }) {
  const token = await signClaims(
    { kind: "user", sub: user.id, email: user.email, name: user.displayName, role: user.role },
    serverEnv().secret,
    "14d",
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
