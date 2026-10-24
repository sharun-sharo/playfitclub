import type { Metadata } from "next";
import { Suspense } from "react";
import { playDecisionForUser } from "@fitplay/db";
import { RoundSignal } from "@/components/analytics/product-signals";
import { SubscriptionExpired } from "@/components/account/subscription-expired";
import { FitRunnerV2 } from "@/components/fitrunner-v2/fitrunner-v2";
import { readUser } from "@/lib/auth";
import { FREE_DEMO_ACTIVE_SECONDS, fitRunnerAccess } from "@/lib/fitrunner-v2/demo-access";
import { TvPlayFrame, TvStatus } from "../tv-chrome";

export const metadata: Metadata = {
  title: "Play FitRunner — TV",
  description: "FitRunner on a television. Pair the existing phone controller with the on-screen code.",
  robots: { index: false, follow: false },
};

const TV_RENEWAL_NOTE = "Renewal is on your phone. Send the existing WhatsApp renew message from there. This television does not take payment.";

export default function TvPlayPage() {
  return (
    <Suspense fallback={<TvStatus title="Opening FitRunner" detail="The game is loading on this screen. Your phone stays the controller." />}>
      <TvPlayAccess />
    </Suspense>
  );
}

async function TvPlayAccess() {
  const access = await fitRunnerAccess();
  if (access === "blocked") {
    const session = await readUser();
    let message: string | undefined;
    let note: string | undefined = TV_RENEWAL_NOTE;
    if (session?.sub) {
      try {
        const decision = await playDecisionForUser(session.sub);
        if (!decision.allowed) {
          message = decision.message;
          if (decision.reason !== "expired_individual" && decision.reason !== "expired_gym") note = undefined;
        }
      } catch {
        message = undefined;
      }
    }
    return <SubscriptionExpired message={message} note={note} tv />;
  }
  return (
    <TvPlayFrame>
      <FitRunnerV2 demoLimitSeconds={access === "demo" ? FREE_DEMO_ACTIVE_SECONDS : null} />
      <RoundSignal />
    </TvPlayFrame>
  );
}
