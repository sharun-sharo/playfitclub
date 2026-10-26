import type { ReactNode } from "react";
import { fpDisplay, fpSans } from "@/components/marketing/fonts";
import "@/app/marketing.css";
import "@/app/marketing-site.css";

export function MarketingFrame({ children, classic = false }: { children: ReactNode; classic?: boolean }) {
  return <div className={`fp${classic ? "" : " fp-site"} ${fpDisplay.variable} ${fpSans.variable}`}>{children}</div>;
}
