import type { Metadata } from "next";
import Link from "next/link";
import { PricingViewed } from "@/components/analytics/pricing-viewed";
import { TrackedExternal, TrackedLink } from "@/components/analytics/tracked-link";
import { FaqList } from "@/components/marketing/faq-list";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { pricingMetadata } from "@/lib/site-metadata";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata: Metadata = pricingMetadata;

const pricingQuestions = [
  {
    q: "Does this page take payment?",
    a: "No. Play Free opens the demo. Asking about Premium opens WhatsApp. Book a Demo opens the gym form. None of these grant paid access or start a subscription.",
  },
  {
    q: "What is included in the free demo?",
    a: "The free demo is ₹0 and includes 10 minutes of cumulative active time in Fit Run on your phone. Fit Fight and Fit Dance are coming soon.",
  },
  {
    q: "What is Individual Pro?",
    a: "Individual Pro is the listed subscription at ₹999 for one person playing at home. The team activates it after confirmation. The button on this page does not turn it on.",
  },
  {
    q: "How do the gym subscriptions differ?",
    a: "Gym Starter is ₹19,999 for up to 49 member accounts. Gym Pro is ₹39,999 for 50 to 99 member accounts. Both are listed subscriptions. Fit Run is the playable game.",
  },
];

const compare = [
  ["Price", "₹0", "₹999", "₹19,999", "₹39,999"],
  ["Who it is for", "A home demo", "One person at home", "Up to 49 accounts", "50 to 99 accounts"],
  ["Fit Run", "Included", "Included", "Included", "Included"],
  ["Fit Fight and Fit Dance", "Coming soon", "Coming soon", "Coming soon", "Coming soon"],
  ["Payment on this page", "None", "None", "None", "None"],
];

export default function PricingPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <PricingViewed />
      <main className="fp-wrap fp-page">
        <p className="fp-kicker">Listed subscriptions</p>
        <h1>Pricing</h1>
        <p className="fp-lead">
          These are the listed subscription prices. The PlayFit Club team activates an account after confirmation. Buttons on this page do not grant paid access and do not take payment.
        </p>
        <p className="fp-note">Fit Run is the playable game. Fit Fight and Fit Dance are coming soon and are not included as playable games.</p>

        <h2 className="fp-group-title">For home</h2>
        <div className="fp-duo">
          <article className="fp-card" id="free-demo">
            <p className="fp-kicker">Playable now</p>
            <h3>Free</h3>
            <p className="fp-price">₹0</p>
            <p>Play the free demo.</p>
            <ul>
              <li>10 minutes of cumulative active time</li>
              <li>Fit Run on your phone</li>
              <li>No paid features</li>
            </ul>
            <TrackedLink className="fp-btn fp-btn-primary" href="/play/phone" events={[{ name: "play_clicked", params: { surface: "pricing" } }]}>
              Play Free
            </TrackedLink>
          </article>
          <article className="fp-card" id="individual-pro">
            <p className="fp-kicker">Listed subscription</p>
            <h3>Premium</h3>
            <p className="fp-price">₹999</p>
            <p>Individual Pro. Game access for one person at home.</p>
            <ul>
              <li>Fit Run on your phone</li>
              <li>Personal scores and achievements when signed in</li>
              <li>Session history on the account</li>
            </ul>
            <TrackedExternal
              className="fp-btn fp-btn-primary"
              href={whatsappUrl("upgrade")}
              events={[
                { name: "individual_plan_selected", params: { plan: "individual_pro" } },
                { name: "whatsapp_enquiry_clicked", params: { audience: "player" } },
              ]}
            >
              Ask about Premium
            </TrackedExternal>
          </article>
        </div>

        <h2 className="fp-group-title">For gyms</h2>
        <div className="fp-duo">
          <article className="fp-card" id="gym-starter">
            <p className="fp-kicker">Listed subscription</p>
            <h3>Gym Starter</h3>
            <p className="fp-price">₹19,999</p>
            <p>Up to 49 member accounts.</p>
            <ul>
              <li>Up to 49 member accounts</li>
              <li>Members play Fit Run on their phones</li>
              <li>Gym dashboard, invitations, and leaderboard</li>
            </ul>
            <Link className="fp-btn fp-btn-primary" href="/for-gyms#demo">
              Book a Demo
            </Link>
          </article>
          <article className="fp-card" id="gym-pro">
            <p className="fp-kicker">Listed subscription</p>
            <h3>Gym Pro</h3>
            <p className="fp-price">₹39,999</p>
            <p>50 to 99 member accounts.</p>
            <ul>
              <li>50 to 99 member accounts</li>
              <li>The same member tools as Gym Starter</li>
            </ul>
            <Link className="fp-btn fp-btn-primary" href="/for-gyms#demo">
              Book a Demo
            </Link>
          </article>
        </div>

        <h2 className="fp-group-title">Compare</h2>
        <div className="fp-compare" role="table" aria-label="Listed subscriptions">
          <div className="fp-compare-row fp-compare-head" role="row">
            <span role="columnheader"> </span>
            <span role="columnheader">Free</span>
            <span role="columnheader">Premium</span>
            <span role="columnheader">Gym Starter</span>
            <span role="columnheader">Gym Pro</span>
          </div>
          {compare.map((row) => (
            <div className="fp-compare-row" role="row" key={row[0]}>
              {row.map((cell, index) => (
                <span key={`${row[0]}-${cell}`} role={index === 0 ? "rowheader" : "cell"}>
                  {cell}
                </span>
              ))}
            </div>
          ))}
        </div>

        <h2 className="fp-group-title">Questions</h2>
        <FaqList items={pricingQuestions} />
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
