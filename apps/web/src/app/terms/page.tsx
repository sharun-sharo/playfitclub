import type { Metadata } from "next";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export const metadata: Metadata = {
  title: "Terms — PlayFit Club",
  description: "PlayFit Club has not published terms of service yet.",
};

export default function TermsPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <main className="fp-wrap fp-legal">
        <p className="fp-kicker">Legal</p>
        <h1>Terms</h1>
        <p>PlayFit Club has not published terms of service yet. This page exists so the link is real. It is not a contract.</p>
        <p>
          Playing the current build does not create a published paid plan. Pricing has not been decided. The game estimates movement for play. It does not judge exercise form and it cannot prevent injury. Keep a clear space around you.
        </p>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}