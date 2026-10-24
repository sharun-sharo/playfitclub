import { findAuthState, roleSatisfies } from "@fitplay/db";
import { signClaims, verifyClaims, type UserClaims, type UserRole } from "@fitplay/shared";
import { cookies } from "next/headers";
import { serverEnv } from "./env";

export const SESSION_COOKIE = "fitplay_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

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

export async function readAccountSession() {
  const claims = await readUser();
  if (!claims?.sub) return null;
  const record = await findAuthState(claims.sub);
  if (!record || record.accountStatus !== "ACTIVE") return null;
  const claimVersion = typeof claims.sv === "number" ? claims.sv : 0;
  if (record.sessionVersion !== claimVersion) return null;
  return { claims, record };
}

export async function requireUser(roles?: UserRole[]) {
  const session = await readAccountSession();
  if (!session) return null;
  if (session.record.mustChangePassword) return null;
  if (roles && !roleSatisfies(session.record.role, roles)) return null;
  return {
    ...session.claims,
    role: session.record.role,
    email: session.record.email ?? session.claims.email,
    name: session.record.displayName,
    sub: session.record.id,
  };
}

export async function writeSession(user: {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  sessionVersion?: number;
  mustChangePassword?: boolean;
}) {
  const token = await signClaims(
    {
      kind: "user",
      sub: user.id,
      email: user.email,
      name: user.displayName,
      role: user.role,
      sv: user.sessionVersion ?? 0,
      pw: user.mustChangePassword ?? false,
    },
    serverEnv().secret,
    "14d",
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
