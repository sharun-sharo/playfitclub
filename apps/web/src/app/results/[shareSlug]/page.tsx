import { Suspense } from "react";
import { SharedResult } from "@/components/results/result-view";

export default function ResultPage({ params }: { params: Promise<{ shareSlug: string }> }) {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-muted-foreground">Loading result…</div>}>
      <Loaded params={params} />
    </Suspense>
  );
}

async function Loaded({ params }: { params: Promise<{ shareSlug: string }> }) {
  const { shareSlug } = await params;
  return <SharedResult shareSlug={shareSlug} />;
}
