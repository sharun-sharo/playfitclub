import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("Play", "A join code and QR appear on this screen so a phone can pair. This is a live session, not a public page.");

export default function PlayLayout({ children }: { children: ReactNode }) {
  return children;
}
