import { TrackedExternal } from "@/components/analytics/tracked-link";
import { AppShell } from "@/components/app-shell";
import { noIndex } from "@/lib/site-metadata";
import { whatsappUrl } from "@/lib/whatsapp";

export const metadata = noIndex(
  "Get started",
  "There is no public registration. The team opens the account after subscription confirmation. WhatsApp sends an enquiry, not a payment.",
);

export default function RegisterPage() {
  return (
    <AppShell>
      <main id="content" className="fp-wrap fp-page">
        <p className="fp-kicker">Account</p>
        <h1>Accounts are opened by the team</h1>
        <p className="fp-lead">
          There is no public registration. The PlayFit Club team creates the account and activates the subscription after confirmation. Opening WhatsApp sends an enquiry. It does not create an account, take payment, or turn a subscription on.
        </p>
        <div className="fp-actions">
          <TrackedExternal
            className="fp-btn fp-btn-primary"
            href={whatsappUrl("general")}
            events={[
              { name: "get_started_clicked", params: { surface: "register" } },
              { name: "whatsapp_enquiry_clicked", params: { audience: "player" } },
            ]}
          >
            Get Started
          </TrackedExternal>
          <TrackedExternal
            className="fp-btn fp-btn-ghost"
            href={whatsappUrl("individual")}
            events={[
              { name: "individual_plan_selected", params: { plan: "individual_pro" } },
              { name: "whatsapp_enquiry_clicked", params: { audience: "player" } },
            ]}
          >
            Individual subscription
          </TrackedExternal>
          <TrackedExternal
            className="fp-btn fp-btn-ghost"
            href={whatsappUrl("gym")}
            events={[
              { name: "gym_plan_selected", params: { plan: "gym" } },
              { name: "whatsapp_enquiry_clicked", params: { audience: "gym" } },
            ]}
          >
            Gym subscription
          </TrackedExternal>
        </div>
      </main>
    </AppShell>
  );
}
