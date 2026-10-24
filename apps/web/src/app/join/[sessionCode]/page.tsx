import { Suspense } from "react";
import { PairingSignal } from "@/components/analytics/product-signals";
import { PhoneSession } from "@/components/join/phone-session";

export default function JoinPage({ params }: { params: Promise<{ sessionCode: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white" />}>
      <Joined params={params} />
    </Suspense>
  );
}

async function Joined({ params }: { params: Promise<{ sessionCode: string }> }) {
  const { sessionCode } = await params;
  return (
    <>
      <PhoneSession code={sessionCode} />
      <PairingSignal />
    </>
  );
}
