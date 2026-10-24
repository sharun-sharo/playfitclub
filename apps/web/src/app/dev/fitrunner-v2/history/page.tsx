import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FitRunnerHistory } from "@/components/fitrunner-v2/history-view";

export const metadata: Metadata = {
  title: "FitRunner V2 history — dev",
  robots: { index: false, follow: false },
};

export default function FitRunnerHistoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FitRunnerHistory />;
}
