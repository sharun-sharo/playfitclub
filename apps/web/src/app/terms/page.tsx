import type { Metadata } from "next";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { termsMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = termsMetadata;

export default function TermsPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <main className="fp-wrap fp-legal">
        <p className="fp-kicker">Legal</p>
        <h1>Terms</h1>
        <p>PlayFit Club has not published terms of service yet. This page exists so the link is real. It is not a contract.</p>
        <p>
          Listed subscriptions are on the pricing page. Opening WhatsApp sends an enquiry. It does not take payment or turn a plan on. Fit Run estimates movement for play. It does not give medical advice. Keep a clear space around you.
        </p>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}