import type { Metadata } from "next";
import { Suspense } from "react";
import { playDecisionForUser } from "@fitplay/db";
import { SubscriptionExpired } from "@/components/account/subscription-expired";
import { readUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Subscription expired — PlayFit Club",
  description: "An expired PlayFit Club subscription keeps your history and waits for the team to renew it.",
};

export default function ExpiredSubscriptionPage() {
  return (
    <Suspense fallback={<SubscriptionExpired />}>
      <ExpiredSubscriptionDetails />
    </Suspense>
  );
}

async function ExpiredSubscriptionDetails() {
  const session = await readUser();
  let message: string | undefined;
  if (session?.sub) {
    try {
      const decision = await playDecisionForUser(session.sub);
      if (!decision.allowed) message = decision.message;
    } catch {
      message = undefined;
    }
  }
  return <SubscriptionExpired message={message} />;
}
