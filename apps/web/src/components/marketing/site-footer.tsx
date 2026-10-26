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
