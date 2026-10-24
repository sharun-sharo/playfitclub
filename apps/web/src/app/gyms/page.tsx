import type { Metadata } from "next";
import Link from "next/link";
import { TrackedExternal } from "@/components/analytics/tracked-link";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "For Gyms — PlayFit Club",
    description: "Gyms enquire about member seats. The PlayFit Club team activates the gym subscription.",
};

const steps = [
  {
    title: "Register interest",
    copy: "Send a WhatsApp enquiry. That message does not create a gym or start a subscription.",
  },
  {
    title: "Choose a seat package later",
    copy: "Listed plans are Gym Starter (under 50 members, ₹19,999) and Gym Pro (₹39,999). Nothing on this site charges them, and an enquiry does not assign a seat.",
  },
  {
    title: "Invite members",
    copy: "After the team allocates seats, the owner invites members inside that limit. An invite does not start play by itself.",
  },
  {
    title: "They play at home",
    copy: "Each member opens FitRunner at home on their own television or laptop, with a phone camera as the controller.",
  },
];

export default function GymsPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <main className="fp-wrap fp-page">
        <p className="fp-kicker">For gyms</p>
        <h1 className="fp-title-wide">Turn member workouts into home play.</h1>
        <p className="fp-lead">
          A gym buys member seats. Members play FitRunner at home. PlayFit Club is not installed in the building, and the gym does not host the game.
        </p>
        <p className="fp-note">
          This page does not create a gym account or a subscription. Accounts are activated by the PlayFit Club team after subscription confirmation. Opening WhatsApp does not assign seats or start Gym Starter or Gym Pro.
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
            Register interest
          </TrackedExternal>
          <Link className="fp-btn fp-btn-ghost" href="/pricing">
            See proposed packages
          </Link>
        </div>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
