import { notFound } from "next/navigation";
import { FitRunnerHistory } from "@/components/fitrunner-v2/history-view";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("FitRunner history", "Development history for FitRunner. Not a public page.");

export default function FitRunnerHistoryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FitRunnerHistory />;
}
