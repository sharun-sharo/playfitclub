import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("Shared result", "A shared PlayFit Club round result.");

export default function ResultsLayout({ children }: { children: ReactNode }) {
  return children;
}
