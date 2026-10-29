import { isIndividualRole } from "@fitplay/shared";

/** Who may see Dashboard and History on the workout results card. */
export type ResultsAccount = "individual" | "gym";

/**
 * Logged out hides the links.
 * An active gym member seat, owner membership, owned gym, or GYM_OWNER role is gym-linked.
 * INDIVIDUAL and PLAYER with no gym seat are individual players.
 * Other signed-in roles, such as admin, stay hidden unless a gym link exists.
 * `signedIn` has to come from the server session. A role string alone is not enough.
 */
export function resultsAccountLinks(input: {
  signedIn: boolean;
  role: string | null | undefined;
  gymLinked: boolean;
}): ResultsAccount | null {
  if (!input.signedIn || !input.role) return null;
  if (input.gymLinked || input.role === "GYM_OWNER") return "gym";
  if (isIndividualRole(input.role)) return "individual";
  return null;
}
