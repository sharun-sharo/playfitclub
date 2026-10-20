import { Suspense } from "react";
import { PhoneSession } from "@/components/join/phone-session";

export default function JoinPage({ params }: { params: Promise<{ sessionCode: string }> }) {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-muted-foreground">Opening the session…</div>}>
      <Joined params={params} />
    </Suspense>
  );
}

async function Joined({ params }: { params: Promise<{ sessionCode: string }> }) {
  const { sessionCode } = await params;
  return <PhoneSession code={sessionCode} />;
}
