import { PUBLIC_SELF_REGISTRATION } from "@fitplay/db";
import { jsonError } from "@/lib/http";

export async function POST() {
  if (PUBLIC_SELF_REGISTRATION) return jsonError(500, "REGISTRATION_CLOSED", "Public registration is closed.");
  return jsonError(403, "REGISTRATION_CLOSED", "PlayFit Club accounts are created by the team after subscription confirmation. An enquiry does not create or activate an account.");
}
