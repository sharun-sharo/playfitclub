import type { Metadata } from "next";
import { Suspense } from "react";
import { RoundSignal } from "@/components/analytics/product-signals";
import { SubscriptionExpired } from "@/components/account/subscription-expired";
import { FitRunnerV2 } from "@/components/fitrunner-v2/fitrunner-v2";
import { FREE_DEMO_ACTIVE_SECONDS, fitRunnerAccess } from "@/lib/fitrunner-v2/demo-access";

export const metadata: Metadata = {
  title: "Fit Run — PlayFit Club",
  description: "Play Fit Run on a laptop. Pair a phone with the on-screen code, or use the keyboard on this screen.",
  robots: { index: false, follow: false },
};

export default function FitRunPlayPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#8ec8ea]" />}>
      <FitRunnerAccess />
    </Suspense>
  );
}

async function FitRunnerAccess() {
  const access = await fitRunnerAccess();
  if (access === "blocked") return <SubscriptionExpired />;
  return (
    <>
      <FitRunnerV2 demoLimitSeconds={access === "demo" ? FREE_DEMO_ACTIVE_SECONDS : null} />
      <RoundSignal />
    </>
  );
}
