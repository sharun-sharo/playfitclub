import type { Metadata } from "next";
import Link from "next/link";
import { PricingViewed } from "@/components/analytics/pricing-viewed";
import { TrackedExternal, TrackedLink } from "@/components/analytics/tracked-link";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = {
  title: "Pricing — PlayFit Club",
  description: "Listed PlayFit Club plans. Accounts are activated by the PlayFit Club team after subscription confirmation.",
};

const paidPlans = [
  {
    id: "individual-pro",
    name: "Individual Pro",
    price: "₹999",
    period: "/ subscription period",
    audience: "For individual users playing at home.",
    points: ["Game access", "Personal workout history", "Scores and achievements"],
    intent: "individual" as const,
  },
  {
    id: "gym-starter",
    name: "Gym Starter",
    price: "₹19,999",
    period: "",
    audience: "Under 50 members. For smaller gyms offering subscriptions to their members.",
    points: ["Up to 49 member accounts", "Home gaming access for members", "Gym dashboard and invitations", "Gym leaderboard"],
    intent: "gym" as const,
  },
  {
    id: "gym-pro",
    name: "Gym Pro",
    price: "₹39,999",
    period: "",
    audience: "For growing gyms offering subscriptions to their members.",
    points: ["51–99 member accounts", "All Starter features", "Member engagement reports", "Gym fitness challenges"],
    intent: "gym" as const,
  },
];

export default function PricingPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <PricingViewed />
      <main className="fp-wrap fp-page">
        <p className="fp-kicker">Listed plans</p>
        <h1>Pricing</h1>
        <p className="fp-lead">
          These listed prices are information. Accounts are activated by the PlayFit Club team after subscription confirmation. Opening WhatsApp sends an enquiry. It does not take payment or activate an account.
        </p>
        <div className="fp-plans">
          <article className="fp-plan" id="free-demo">
            <p className="fp-kicker">Listed plan</p>
            <h2>Free demo</h2>
            <p className="fp-price">₹0</p>
            <p>10 minutes of play. No paid features.</p>
            <ul>
              <li>10 minutes of play</li>
              <li>No paid features</li>
            </ul>
            <TrackedLink className="fp-btn fp-btn-primary" href="/play" events={[{ name: "play_clicked", params: { surface: "pricing" } }]}>
              Play free demo
            </TrackedLink>
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
              <TrackedExternal
                className="fp-btn fp-btn-primary"
                href={whatsappUrl(plan.intent)}
                events={
                  plan.intent === "individual"
                    ? [
                        { name: "individual_plan_selected", params: { plan: "individual_pro" } },
                        { name: "whatsapp_enquiry_clicked", params: { audience: "player" } },
                      ]
                    : [
                        { name: "gym_plan_selected", params: { plan: plan.id === "gym-starter" ? "gym_starter" : "gym_pro" } },
                        { name: "whatsapp_enquiry_clicked", params: { audience: "gym" } },
                      ]
                }
              >
                {plan.intent === "individual" ? "Ask about Individual Pro" : "Ask about this gym plan"}
              </TrackedExternal>
            </article>
          ))}
        </div>
        <p className="fp-note">
          A gym enquiry does not assign a seat and does not start Gym Starter or Gym Pro. Upgrade and renewal messages are enquiries too.
        </p>
        <div className="fp-actions">
          <TrackedExternal className="fp-btn fp-btn-ghost" href={whatsappUrl("pricing")} events={[{ name: "whatsapp_enquiry_clicked", params: { audience: "player" } }]}>
            Ask about pricing
          </TrackedExternal>
          <TrackedExternal className="fp-btn fp-btn-ghost" href={whatsappUrl("upgrade")} events={[{ name: "whatsapp_enquiry_clicked", params: { audience: "player" } }]}>
            Ask about an upgrade
          </TrackedExternal>
          <TrackedExternal className="fp-btn fp-btn-ghost" href={whatsappUrl("renewal")} events={[{ name: "whatsapp_enquiry_clicked", params: { audience: "player" } }]}>
            Ask about renewal
          </TrackedExternal>
          <Link className="fp-btn fp-btn-ghost" href="/gyms">
            For gyms
          </Link>
        </div>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
