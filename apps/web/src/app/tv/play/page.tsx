import { Suspense } from "react";
import { playDecisionForUser } from "@fitplay/db";
import { RoundSignal } from "@/components/analytics/product-signals";
import { SubscriptionExpired } from "@/components/account/subscription-expired";
import { FitRunnerV2 } from "@/components/fitrunner-v2/fitrunner-v2";
import { readUser } from "@/lib/auth";
import { FREE_DEMO_ACTIVE_SECONDS, fitRunnerAccess } from "@/lib/fitrunner-v2/demo-access";
import { noIndex } from "@/lib/site-metadata";
import { TvPlayFrame, TvStatus } from "../tv-chrome";

export const metadata = noIndex(
  "Fit Run on TV",
  "FitRunner on this television. Pair the phone with the on-screen code. This screen does not take payment.",
);

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
