import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FitRunnerV2 } from "@/components/fitrunner-v2/fitrunner-v2";

export const metadata: Metadata = {
  title: "FitRunner V2 — dev",
  description: "Development prototype for the FitRunner X Bot and Kenney track.",
  robots: { index: false, follow: false },
};

export default function FitRunnerV2Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FitRunnerV2 />;
}
