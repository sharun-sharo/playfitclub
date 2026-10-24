import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { UserRole } from "./types";

export type TokenKind = "host" | "player" | "user";

export interface HostClaims extends JWTPayload {
  kind: "host";
  sessionId: string;
  joinCode: string;
}

export interface PlayerClaims extends JWTPayload {
  kind: "player";
  sessionId: string;
  playerId: string;
  slot: number;
  displayName: string;
  /** Bumped when this phone's socket is replaced. Older tokens stop reclaiming the seat. */
  epoch?: number;
}

export interface UserClaims extends JWTPayload {
  kind: "user";
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  sv?: number;
  pw?: boolean;
}

function keyFor(secret: string): Uint8Array {
  if (secret.length < 32) {
    throw new Error("Token secret must be at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

export async function signClaims(
  claims: Record<string, unknown>,
  secret: string,
  expiresIn: string,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(keyFor(secret));
}

export async function verifyClaims<T extends JWTPayload>(token: string, secret: string): Promise<T> {
  const { payload } = await jwtVerify(token, keyFor(secret), { algorithms: ["HS256"] });
  return payload as T;
}
