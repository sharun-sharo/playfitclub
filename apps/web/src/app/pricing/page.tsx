import type { Metadata } from "next";
import Link from "next/link";
import { PricingViewed } from "@/components/analytics/pricing-viewed";
import { TrackedExternal, TrackedLink } from "@/components/analytics/tracked-link";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { pricingMetadata } from "@/lib/site-metadata";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = pricingMetadata;

const paidPlans = [
  {
    id: "individual-pro",
    name: "Individual Pro",
    price: "₹999",
    period: "per year",
    audience: "One person playing Fit Run at home.",
    points: ["Fit Run on your phone", "Personal scores and achievements when signed in", "Session history on the account"],
    intent: "individual" as const,
  },
  {
    id: "gym-starter",
    name: "Gym Starter",
    price: "₹19,999",
    period: "per year",
    audience: "A gym with up to 49 member accounts.",
    points: ["Up to 49 member accounts", "Members play Fit Run at home on their phones", "Gym dashboard and invitations", "Gym leaderboard"],
    intent: "gym" as const,
  },
  {
    id: "gym-pro",
    name: "Gym Pro",
    price: "₹39,999",
    period: "per year",
    audience: "A gym with 50 to 99 member accounts.",
    points: ["50 to 99 member accounts", "The same member tools as Gym Starter"],
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
          These are the yearly list prices. The PlayFit Club team activates an account after subscription confirmation. Buttons on this page do not grant paid access and do not take payment.
        </p>
        <p className="fp-note">
          Fit Run is the playable game. Fit Fight and Fit Dance are coming soon and are not included as playable games.
        </p>
        <div className="fp-plans">
          <article className="fp-plan" id="free-demo">
            <p className="fp-kicker">Playable now</p>
            <h2>Free demo</h2>
            <p className="fp-price">₹0</p>
            <p>10 minutes of cumulative active time.</p>
            <ul>
              <li>10 minutes of cumulative active time</li>
              <li>Fit Run on your phone</li>
              <li>When demo time is over, Buy Plan opens Pricing</li>
            </ul>
            <TrackedLink className="fp-btn fp-btn-primary" href="/play/phone" events={[{ name: "play_clicked", params: { surface: "pricing" } }]}>
              Play Demo
            </TrackedLink>
          </article>
          {paidPlans.map((plan) => (
            <article key={plan.id} className="fp-plan" id={plan.id}>
              <p className="fp-kicker">Listed plan</p>
              <h2>{plan.name}</h2>
              <p className="fp-price">
                {plan.price}
                <span> {plan.period}</span>
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
          Asking on WhatsApp sends an enquiry. It does not assign an account, charge a card, or start Individual Pro, Gym Starter, or Gym Pro. Upgrade and renewal messages are enquiries too.
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
