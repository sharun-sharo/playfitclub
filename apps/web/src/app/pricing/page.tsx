import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export const metadata: Metadata = {
  title: "Pricing — PlayFit Club",
  description: "Listed PlayFit Club plans. Payment is not available on this page, and nothing here grants paid access.",
};

const paidPlans = [
  {
    id: "individual-pro",
    name: "Individual Pro",
    price: "₹999",
    period: "/ subscription period",
    audience: "For individual users playing at home.",
    points: ["Game access", "Personal workout history", "Scores and achievements"],
  },
  {
    id: "gym-starter",
    name: "Gym Starter",
    price: "₹19,999",
    period: "",
    audience: "Under 50 members. For smaller gyms offering subscriptions to their members.",
    points: ["Up to 49 member accounts", "Home gaming access for members", "Gym dashboard and invitations", "Gym leaderboard"],
  },
  {
    id: "gym-pro",
    name: "Gym Pro",
    price: "₹39,999",
    period: "",
    audience: "For growing gyms offering subscriptions to their members.",
    points: ["51–99 member accounts", "All Starter features", "Member engagement reports", "Gym fitness challenges"],
  },
];

export default function PricingPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <main className="fp-wrap fp-page">
        <p className="fp-kicker">Listed plans</p>
        <h1>Pricing</h1>
        <p className="fp-lead">
          These are the listed PlayFit Club plans. Payment is not available yet. Nothing on this page takes payment, starts a subscription, or grants paid access.
        </p>
        <div className="fp-plans">
          <article className="fp-plan" id="free-demo">
            <p className="fp-kicker">Listed plan</p>
            <h2>Free demo</h2>
            <p className="fp-price">₹0</p>
            <p>15-second FitRunner try. No paid features.</p>
            <ul>
              <li>15-second FitRunner try</li>
              <li>No paid features</li>
            </ul>
            <Link className="fp-btn fp-btn-primary" href="/play">
              Play free demo
            </Link>
          </article>
          {paidPlans.map((plan) => (
            <article key={plan.id} className="fp-plan" id={plan.id}>
              <p className="fp-kicker">Listed plan</p>
              <h2>{plan.name}</h2>
              <p className="fp-price">
                {plan.price}
                {plan.period ? <span>{plan.period}</span> : null}
              </p>
              <p>{plan.audience}</p>
              <ul>
                {plan.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <button className="fp-btn fp-btn-primary" type="button" disabled>
                Payment is not available yet
              </button>
            </article>
          ))}
        </div>
        <p className="fp-note">
          A gym can register interest in member seats. Sending that note does not assign a seat, and it does not start Gym Starter or Gym Pro.
        </p>
        <div className="fp-actions">
          <Link className="fp-btn fp-btn-ghost" href="/gyms">
            For gyms
          </Link>
          <Link className="fp-btn fp-btn-ghost" href="/#partner">
            Register interest
          </Link>
        </div>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
