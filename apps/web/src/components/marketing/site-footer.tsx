import type { ReactNode } from "react";
import Link from "next/link";
import { TrackedExternal, TrackedLink } from "@/components/analytics/tracked-link";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { CopyrightYear } from "@/components/marketing/copyright-year";
import { whatsappUrl } from "@/lib/whatsapp";

const links = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Experience" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/for-gyms", label: "For Gyms" },
  { href: "/pricing", label: "Pricing" },
  { href: "/login", label: "Login" },
];

export function SiteFooter({ prefix = "" }: { prefix?: "" | "/" }) {
  return (
    <footer className="fp-footer">
      <section className="fp-wrap fp-footer-apps" aria-labelledby="mobile-apps-title">
        <h2 id="mobile-apps-title">Your Fitness Game. Now Going Mobile.</h2>
        <p className="fp-footer-apps-copy">PlayFit Club iOS and Android apps are coming soon. Until then, play directly from your mobile browser.</p>
        <div className="fp-store-badges">
          <StoreBadge name="App Store" label="Coming soon on the App Store">
            <AppStoreMark />
          </StoreBadge>
          <StoreBadge name="Google Play" label="Coming soon on Google Play">
            <GooglePlayMark />
          </StoreBadge>
        </div>
      </section>
      <div className="fp-wrap fp-footer-grid">
        <div>
          <BrandLogo href={prefix || "/"} variant="footer" />
          <p className="fp-muted fp-tagline">Move your body. Play your world.</p>
        </div>
        <nav aria-label="Footer">
          {links.map((link) => {
            const href = link.href.startsWith("#") ? `${prefix}${link.href}` : link.href;
            return link.href.startsWith("#") || link.href.startsWith("/#") ? (
              <a key={link.label} href={href}>
                {link.label}
              </a>
            ) : (
              <Link key={link.label} href={href}>
                {link.label}
              </Link>
            );
          })}
          <TrackedLink href="/games" events={[{ name: "play_clicked", params: { surface: "footer" } }]}>
            Play Now
          </TrackedLink>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <div className="fp-footer-contact">
          <h2>Contact us</h2>
          <a href="mailto:sharunsharo@gmail.com">Email sharunsharo@gmail.com</a>
          <TrackedExternal href={whatsappUrl("general")} events={[{ name: "whatsapp_enquiry_clicked", params: { audience: "player" } }]}>
            WhatsApp +91 95665 51345
          </TrackedExternal>
          <p className="fp-muted">Page views and the listed button clicks are measured. Camera frames and pose stay on the phone. Contact details are not sent to analytics.</p>
        </div>
      </div>
      <div className="fp-wrap fp-copy">
        <p>
          © <CopyrightYear /> PlayFit Club
        </p>
      </div>
    </footer>
  );
}

function StoreBadge({ name, label, children }: { name: string; label: string; children: ReactNode }) {
  return (
    <div className="fp-store-badge" role="img" aria-label={label}>
      {children}
      <span className="fp-store-badge-copy">
        <span className="fp-store-badge-kicker">Coming soon</span>
        <span className="fp-store-badge-name">{name}</span>
      </span>
    </div>
  );
}

function AppStoreMark() {
  return (
    <svg className="fp-store-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.37 12.72c.02 2.18 1.91 2.9 1.93 2.91-.02.05-.3 1.03-1 2.04-.6.87-1.22 1.74-2.2 1.76-.96.02-1.27-.57-2.37-.57s-1.45.55-2.36.59c-.94.04-1.66-.94-2.27-1.81-1.24-1.78-2.18-5.03-.91-7.23.63-1.09 1.76-1.78 2.98-1.8.93-.02 1.81.63 2.37.63.56 0 1.61-.78 2.71-.66.46.02 1.76.19 2.59 1.41-.07.04-1.55.9-1.53 2.73zM14.9 6.9c.5-.61.84-1.46.75-2.31-.72.03-1.6.48-2.12 1.09-.46.54-.87 1.41-.76 2.24.81.06 1.63-.41 2.13-1.02z"
      />
    </svg>
  );
}

function GooglePlayMark() {
  return (
    <svg className="fp-store-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M5 3.7v16.6c0 .7.7 1.1 1.3.7l13.2-8.3c.5-.3.5-1.1 0-1.4L6.3 3c-.6-.4-1.3 0-1.3.7z" />
    </svg>
  );
}
