import { AccessError, BillingError } from "@fitplay/db";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function requireSuperAdmin() {
  const user = await requireUser(["ADMIN", "SUPER_ADMIN"]);
  if (!user?.sub) return null;
  return user;
}

export function billingFailure(error: unknown) {
  if (error instanceof BillingError) return jsonError(error.status, error.code, error.message);
  if (error instanceof AccessError) return jsonError(403, error.code, error.message);
  return jsonError(503, "UNAVAILABLE", "That admin action could not be saved.");
}
