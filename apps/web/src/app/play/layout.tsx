import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex(
  "Play",
  "Choose phone or laptop Fit Run. Your body is the controller.",
);

export default function PlayLayout({ children }: { children: ReactNode }) {
  return children;
}
