import type { Metadata } from "next";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export const metadata: Metadata = {
  title: "Privacy — PlayFit Club",
  description: "PlayFit Club has not published a privacy policy yet. This page explains what the product does today.",
};

export default function PrivacyPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <main className="fp-wrap fp-legal">
        <p className="fp-kicker">Legal</p>
        <h1>Privacy</h1>
        <p>PlayFit Club has not published a privacy policy yet. This page exists so the link is real. It is not a complete privacy notice and it is not legal advice.</p>
        <p>
          What the product does today: the phone runs pose tracking in the browser. Camera frames are not uploaded or stored. PlayFit Club does not store images, recordings, or biometric templates. If you create an account, join a gym, or finish a round, the app can store account details, gym records, and game results in its database.
        </p>
        <p>The gym enquiry form on the homepage writes only to this browser. It is not sent to a server.</p>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
