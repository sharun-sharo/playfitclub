import Link from "next/link";
import { CopyrightYear } from "@/components/marketing/copyright-year";

const links = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Experience" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/gyms", label: "For Gyms" },
  { href: "/pricing", label: "Pricing" },
  { href: "/login", label: "Login" },
  { href: "/register", label: "Get Started" },
];

export function SiteFooter({ prefix = "" }: { prefix?: "" | "/" }) {
  return (
    <footer className="fp-footer">
      <div className="fp-wrap fp-footer-grid">
        <div>
          <p className="fp-logo">
            <span className="fp-mark" aria-hidden="true" />
            PlayFit Club
          </p>
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
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <p className="fp-muted fp-contact-note">
          No public email address is published. For Gyms explains member seats for home play. The enquiry form on the homepage stays in this browser until an API is connected.
        </p>
      </div>
      <div className="fp-wrap fp-copy">
        <p>
          © <CopyrightYear /> PlayFit Club
        </p>
      </div>
    </footer>
  );
}
