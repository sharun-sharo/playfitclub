import { playDecisionForUser } from "@fitplay/db";
import { readUser } from "@/lib/auth";

/** Active running time for a free FitRunner V2 demo. Paused time is not included. */
export const FREE_DEMO_ACTIVE_SECONDS = 10 * 60;

/**
 * Guests and accounts with no paid subscription stay on the 10-minute demo.
 * An expired paid individual or gym subscription is blocked, including the demo path.
 * A failed lookup does not grant paid access.
 */
export async function fitRunnerAccess(): Promise<"demo" | "open" | "blocked"> {
  try {
    const session = await readUser();
    if (!session?.sub) return "demo";
    const decision = await playDecisionForUser(session.sub);
    if (!decision.allowed) return "blocked";
    return decision.mode === "paid" ? "open" : "demo";
  } catch {
    return "demo";
  }
}

export async function fitRunnerDemoLimited(): Promise<boolean> {
  return (await fitRunnerAccess()) !== "open";
}
