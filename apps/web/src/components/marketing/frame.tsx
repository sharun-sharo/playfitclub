import type { ReactNode } from "react";
import { fpDisplay, fpSans } from "@/components/marketing/fonts";
import "@/app/marketing.css";

export function MarketingFrame({ children }: { children: ReactNode }) {
  return <div className={`fp ${fpDisplay.variable} ${fpSans.variable}`}>{children}</div>;
}
