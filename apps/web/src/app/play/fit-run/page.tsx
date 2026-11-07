import { Suspense } from "react";
import { SubscriptionExpired } from "@/components/account/subscription-expired";
import { PhoneFitRun } from "@/components/fitrunner-v2/phone-fit-run";
import { FREE_DEMO_ACTIVE_SECONDS, fitRunnerAccess } from "@/lib/fitrunner-v2/demo-access";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex(
  "Play Fit Run on your laptop",
  "Play Fit Run in this browser. Your laptop camera tracks your body on this device.",
);

export default function FitRunPlayPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <FitRunnerAccess />
    </Suspense>
  );
}

async function FitRunnerAccess() {
  const access = await fitRunnerAccess();
  if (access === "blocked") return <SubscriptionExpired />;
  return <PhoneFitRun demoLimitSeconds={access === "demo" ? FREE_DEMO_ACTIVE_SECONDS : null} surface="laptop" />;
}
