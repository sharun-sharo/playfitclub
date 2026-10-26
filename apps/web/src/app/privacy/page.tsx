import type { Metadata } from "next";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { privacyMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = privacyMetadata;

export default function PrivacyPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <main className="fp-wrap fp-legal">
        <p className="fp-kicker">Legal</p>
        <h1>Privacy</h1>
        <p>PlayFit Club has not published a privacy policy yet. This page exists so the link is real. It is not a complete privacy notice and it is not legal advice.</p>
        <p>
          What the product does today: Fit Run runs on your phone, and pose tracking stays in that browser. Camera frames are not uploaded or stored. PlayFit Club does not store images, recordings, or biometric templates. If you create an account, join a gym, or finish a round, the app can store account details, gym records, and game results in its database.
        </p>
        <p>
          Page views, including pages opened after you move around the site, are measured. These button events are measured after the action succeeds: play, pricing viewed, individual plan selected, gym plan selected, get started, WhatsApp enquiry (player or gym only), login completed, Fit Run selected, and game started. Camera frames and pose stay on the phone. Names, phone numbers, emails, and sign-in details are not sent to analytics.
        </p>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
