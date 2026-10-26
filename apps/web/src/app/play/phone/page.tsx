import { Suspense } from "react";
import { SubscriptionExpired } from "@/components/account/subscription-expired";
import { PhoneFitRun } from "@/components/fitrunner-v2/phone-fit-run";
import { FREE_DEMO_ACTIVE_SECONDS, fitRunnerAccess } from "@/lib/fitrunner-v2/demo-access";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex(
  "Play Fit Run on your phone",
  "Play Fit Run on your phone, then mirror that phone screen to a TV or laptop.",
);

export default function PhonePlayPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#8ec8ea]" />}>
      <PhoneAccess />
    </Suspense>
  );
}

async function PhoneAccess() {
  const access = await fitRunnerAccess();
  if (access === "blocked") return <SubscriptionExpired />;
  return <PhoneFitRun demoLimitSeconds={access === "demo" ? FREE_DEMO_ACTIVE_SECONDS : null} />;
}
