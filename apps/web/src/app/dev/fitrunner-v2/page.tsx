import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoundSignal } from "@/components/analytics/product-signals";
import { SubscriptionExpired } from "@/components/account/subscription-expired";
import { FitRunnerV2 } from "@/components/fitrunner-v2/fitrunner-v2";
import { FREE_DEMO_ACTIVE_SECONDS, fitRunnerAccess } from "@/lib/fitrunner-v2/demo-access";

export const metadata: Metadata = {
  title: "FitRunner V2 — dev",
  description: "Development prototype for the FitRunner X Bot and Kenney track.",
  robots: { index: false, follow: false },
};

export default function FitRunnerV2Page() {
  if (process.env.NODE_ENV === "production") notFound();
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
