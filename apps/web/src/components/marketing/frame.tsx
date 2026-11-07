import type { ReactNode } from "react";
import { fpDisplay, fpSans } from "@/components/marketing/fonts";
import "@/app/marketing.css";
import "@/app/marketing-site.css";

export function MarketingFrame({
  children,
  classic = false,
  home = false,
}: {
  children: ReactNode;
  classic?: boolean;
  home?: boolean;
}) {
  const theme = classic ? "" : " fp-site";
  const homeClass = home ? " fp-home" : "";
  return <div className={`fp fp-market${theme}${homeClass} ${fpDisplay.variable} ${fpSans.variable}`}>{children}</div>;
}
