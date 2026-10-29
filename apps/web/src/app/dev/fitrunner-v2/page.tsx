import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoundSignal } from "@/components/analytics/product-signals";
import { SubscriptionExpired } from "@/components/account/subscription-expired";
import { FitRunnerV2 } from "@/components/fitrunner-v2/fitrunner-v2";
import { FREE_DEMO_ACTIVE_SECONDS, fitRunnerAccess } from "@/lib/fitrunner-v2/demo-access";
import { resultsAccountForViewer } from "@/lib/fitrunner-v2/results-account-session";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("FitRunner dev", "Development prototype for FitRunner. Not a public page.");

export default function FitRunnerV2Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#8ec8ea]" />}>
      <FitRunnerAccess />
    </Suspense>
  );
}

async function FitRunnerAccess() {
  const [access, accountLinks] = await Promise.all([fitRunnerAccess(), resultsAccountForViewer()]);
  if (access === "blocked") return <SubscriptionExpired />;
  return (
    <>
      <FitRunnerV2 demoLimitSeconds={access === "demo" ? FREE_DEMO_ACTIVE_SECONDS : null} accountLinks={accountLinks} />
      <RoundSignal />
    </>
  );
}
