import type { Metadata } from "next";
import Link from "next/link";
import { TrackedExternal } from "@/components/analytics/tracked-link";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { gymsMetadata } from "@/lib/site-metadata";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = gymsMetadata;

const steps = [
  {
    title: "Send a message",
    copy: "Request a demo on WhatsApp. That message does not create a gym, reserve a time, or start a subscription.",
  },
  {
    title: "Choose a listed plan",
    copy: "Gym Starter is ₹19,999 per year for up to 49 member accounts. Gym Pro is ₹39,999 per year for 50 to 99 member accounts. This site does not charge either plan.",
  },
  {
    title: "Invite members",
    copy: "After the team allocates accounts, the owner invites members inside that limit. An invite does not start play by itself.",
  },
  {
    title: "They play at home",
    copy: "Each member opens Fit Run on their own phone. The camera tracks their body. A TV shows the game only if they mirror the phone.",
  },
];

export default function GymsPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <main className="fp-wrap fp-page">
        <p className="fp-kicker">For gyms</p>
        <h1 className="fp-title-wide">Member accounts for home play.</h1>
        <p className="fp-lead">
          A gym buys accounts so members can play Fit Run at home on their phones. PlayFit Club is not installed in the building, and the gym does not host the game.
        </p>
        <p className="fp-note">
          Fit Run is the playable game. Fit Fight and Fit Dance are coming soon. This page does not create a gym account. The team activates a subscription after confirmation.
        </p>
        <div className="fp-benefits">
          {steps.map((step, index) => (
            <article key={step.title}>
              <p className="fp-kicker">Step 0{index + 1}</p>
              <h2>{step.title}</h2>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
        <div className="fp-actions">
          <TrackedExternal
            className="fp-btn fp-btn-primary"
            href={whatsappUrl("gym")}
            events={[{ name: "whatsapp_enquiry_clicked", params: { audience: "gym" } }]}
          >
            Request a demo
          </TrackedExternal>
          <Link className="fp-btn fp-btn-ghost" href="/pricing">
            See listed plans
          </Link>
        </div>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
