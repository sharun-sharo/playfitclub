import { Suspense } from "react";
import { SubscriptionExpired } from "@/components/account/subscription-expired";
import { PhoneFitRun } from "@/components/fitrunner-v2/phone-fit-run";
import { phoneDisplayMode } from "@/components/fitrunner-v2/phone-local-play";
import { FREE_DEMO_ACTIVE_SECONDS, fitRunnerAccess } from "@/lib/fitrunner-v2/demo-access";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex(
  "Play Fit Run on your phone",
  "Play Fit Run on your phone, then mirror that phone screen to a TV or laptop.",
);

export default function PhonePlayPage({
  searchParams,
}: {
  searchParams: Promise<{ display?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black" />}>
      <PhoneAccess searchParams={searchParams} />
    </Suspense>
  );
}

async function PhoneAccess({
  searchParams,
}: {
  searchParams: Promise<{ display?: string | string[] }>;
}) {
  const access = await fitRunnerAccess();
  if (access === "blocked") return <SubscriptionExpired />;
  const params = await searchParams;
  const display = phoneDisplayMode(params.display);
  return (
    <PhoneFitRun
      demoLimitSeconds={access === "demo" ? FREE_DEMO_ACTIVE_SECONDS : null}
      display={display}
    />
  );
}
