import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("Dev", "Development screens for FitRunner. Not a public page.");

export default function DevLayout({ children }: { children: ReactNode }) {
  return children;
}
