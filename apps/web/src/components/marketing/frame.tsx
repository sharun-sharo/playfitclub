import type { ReactNode } from "react";
import { fpDisplay, fpSans } from "@/components/marketing/fonts";
import "@/app/marketing.css";
import "@/app/marketing-site.css";

export function MarketingFrame({ children }: { children: ReactNode }) {
  return <div className={`fp fp-site ${fpDisplay.variable} ${fpSans.variable}`}>{children}</div>;
}
