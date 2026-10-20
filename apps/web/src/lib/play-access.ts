import { findUserById, gymForOwner, listFlags } from "@fitplay/db";
import type { PlayAccess, PlayAccessKind } from "@/components/play/play-types";
import { readUser } from "@/lib/auth";
import { serverEnv } from "@/lib/env";

/**
 * No payment provider is configured in this app.
 * Keep this false so a button cannot grant paid access.
 */
const checkoutAvailable = false;

function allowLongRound(homePlay: boolean, kind: PlayAccessKind) {
  if (!homePlay) return false;
  if (checkoutAvailable && (kind === "guest" || kind === "free" || kind === "unknown" || kind === "expired")) return false;
  return true;
}

function base(partial: Omit<PlayAccess, "checkoutAvailable" | "shortRounds"> & { shortRounds?: boolean }): PlayAccess {
  return {
    checkoutAvailable,
    shortRounds: partial.shortRounds ?? false,
    ...partial,
  };
}

export async function resolvePlayAccess(): Promise<PlayAccess> {
  const shortRounds = serverEnv().allowShortSessions;
  const session = await readUser().catch(() => null);

  let homePlay = true;
  try {
    const flags = await listFlags();
    const flag = flags.find((item) => item.key === "home_play");
    homePlay = flag ? flag.enabled : true;
  } catch {
    homePlay = true;
  }

  if (!session?.sub) {
    return base({
      kind: "guest",
      displayName: null,
      email: null,
      status: homePlay
        ? "Not signed in. No paid plan. Payment is not available yet, so the 3-minute home lobby stays open."
        : "Not signed in. Home play is turned off.",
      homePlay,
      shortRounds: shortRounds && homePlay,
      longRoundAllowed: allowLongRound(homePlay, "guest"),
      gymName: null,
      gymHref: null,
      gymSessionSlug: null,
    });
  }

  try {
    const user = await findUserById(session.sub);
    if (!user) {
      return base({
        kind: "unknown",
        displayName: session.name || null,
        email: session.email || null,
        status: "This sign-in did not match an account. Payment is not available, so the home lobby stays open.",
        homePlay,
        shortRounds: shortRounds && homePlay,
        longRoundAllowed: allowLongRound(homePlay, "unknown"),
        gymName: null,
        gymHref: null,
        gymSessionSlug: null,
      });
    }

    const memberships = user.memberships;
    const active = memberships.find(
      (membership) => membership.gym.subscriptionStatus === "ACTIVE" || membership.gym.subscriptionStatus === "TRIALING",
    );
    const expired = memberships.find((membership) => membership.gym.subscriptionStatus === "EXPIRED");
    const hosted = await gymForOwner(session.sub);
    const gymSessionSlug = hosted && hosted.subscriptionStatus !== "EXPIRED" ? hosted.slug : null;

    if (active) {
      const sameGym = hosted && hosted.id === active.gym.id && hosted.subscriptionStatus !== "EXPIRED";
      return base({
        kind: "gym",
        displayName: user.displayName,
        email: user.email,
        status: `Sponsored by ${active.gym.name}. Gym subscription is ${active.gym.subscriptionStatus}.`,
        homePlay,
        shortRounds: shortRounds && homePlay,
        longRoundAllowed: allowLongRound(homePlay, "gym"),
        gymName: active.gym.name,
        gymHref: sameGym ? "/dashboard/leaderboard" : null,
        gymSessionSlug,
      });
    }

    if (expired) {
      return base({
        kind: "expired",
        displayName: user.displayName,
        email: user.email,
        status: `${expired.gym.name} subscription is expired. Renew does not turn it back on. Home play stays open while payment is unavailable.`,
        homePlay,
        shortRounds: shortRounds && homePlay,
        longRoundAllowed: allowLongRound(homePlay, "expired"),
        gymName: expired.gym.name,
        gymHref: null,
        gymSessionSlug: null,
      });
    }

    return base({
      kind: "free",
      displayName: user.displayName,
      email: user.email,
      status: `Signed in as ${user.displayName}. No paid plan on this account. Payment is not available yet, so the 3-minute home lobby stays open.`,
      homePlay,
      shortRounds: shortRounds && homePlay,
      longRoundAllowed: allowLongRound(homePlay, "free"),
      gymName: null,
      gymHref: null,
      gymSessionSlug: null,
    });
  } catch {
    return base({
      kind: "unknown",
      displayName: session.name || null,
      email: session.email || null,
      status: "Subscription status could not be loaded. Payment is not available, so the home lobby stays open.",
      homePlay: true,
      shortRounds,
      longRoundAllowed: true,
      gymName: null,
      gymHref: null,
      gymSessionSlug: null,
    });
  }
}
