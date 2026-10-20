import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export const metadata: Metadata = {
  title: "For Gyms — PlayFit Club",
  description:
    "Gyms buy member seats so people can play FitRunner at home. A full seat signup is not live yet.",
};

const steps = [
  {
    title: "Register interest",
    copy: "Tell us about the gym. The form saves a draft on this device and does not send an email.",
  },
  {
    title: "Choose a seat package later",
    copy: "Listed plans are Gym Starter (under 50 members, ₹19,999) and Gym Pro (₹39,999). Nothing on this site charges them, and an enquiry does not assign a seat.",
  },
  {
    title: "Invite members",
    copy: "When seat signup exists, the gym will invite members. That invite flow is not available yet.",
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
          A full seat signup is not live yet. This page does not create a gym account or a subscription. Register interest, and the draft stays in this browser.
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
          <a className="fp-btn fp-btn-primary" href="/#partner">
            Register interest
          </a>
          <Link className="fp-btn fp-btn-ghost" href="/pricing">
            See proposed packages
          </Link>
        </div>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
