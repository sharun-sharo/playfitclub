"use client";

import type { ReactNode } from "react";
import { SiteFooter } from "@/components/marketing/site-footer";
import { fpDisplay, fpSans } from "@/components/marketing/fonts";
import { SiteHeader } from "@/components/site-header";
import "@/app/marketing.css";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={`fp ${fpDisplay.variable} ${fpSans.variable}`}>
      <a className="fp-skip" href="#content">
        Skip to content
      </a>
      <SiteHeader />
      {children}
      <SiteFooter prefix="/" />
    </div>
  );
}
