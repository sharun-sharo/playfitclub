"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BicepsFlexed,
  Building2,
  ChevronsRight,
  Gamepad2,
  Home,
  LayoutDashboard,
  Play,
  Shield,
  Tag,
  User,
  type LucideIcon,
} from "lucide-react";
import { isSuperAdminRole } from "@fitplay/shared";
import { trackEvent } from "@/components/analytics/track-event";
import { BrandLogo } from "@/components/marketing/brand-logo";

interface Me {
  user: { displayName: string; role: string } | null;
}

const baseLinks: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/games", label: "Experience", icon: Gamepad2 },
  { href: "/#how-it-works", label: "How It Works", icon: BicepsFlexed },
  { href: "/for-gyms", label: "For Gyms", icon: Building2 },
  { href: "/pricing", label: "Pricing", icon: Tag },
];

function hrefFor(href: string, prefix: "" | "/") {
  return href.startsWith("#") ? `${prefix}${href}` : href;
}

function isCurrent(href: string, pathname: string) {
  if (href.startsWith("#") || href.startsWith("/#")) return false;
  return pathname === href;
}

function focusableIn(panel: HTMLElement) {
  return [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
}

export function SiteNav({ prefix = "", logo = "footer" }: { prefix?: "" | "/"; logo?: "default" | "footer" }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreScroll = useRef(true);

  useEffect(() => {
    void fetch("/api/me")
      .then((response) => response.json())
      .then((body: Me) => setMe(body))
      .catch(() => setMe({ user: null }));
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 960px)");
    const onChange = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const items = focusableIn(panel);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    restoreScroll.current = true;
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    if (panel) focusableIn(panel)[0]?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      if (restoreScroll.current) window.scrollTo(0, scrollY);
    };
  }, [open]);

  function close(restore = true) {
    restoreScroll.current = restore;
    setOpen(false);
  }

  function play(surface: "nav") {
    trackEvent("play_clicked", { surface });
    close(false);
  }

  const accountLinks = me?.user
    ? [
        { href: "/dashboard", label: "Account", icon: LayoutDashboard },
        ...(isSuperAdminRole(me.user.role) ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
      ]
    : [];

  const links = [...baseLinks, ...accountLinks];
  const authLink = me?.user ? null : { href: "/login", label: "Login", icon: User };

  return (
    <header className="fp-nav fp-nav-market" data-menu-open={open ? "true" : "false"}>
      <div className="fp-nav-bar">
        <div className="fp-nav-shell">
          <BrandLogo href={prefix || "/"} variant={logo} />
          <nav className="fp-nav-desktop" aria-label="Primary">
            <div className="fp-nav-links">
              {links.map((link) => {
                const href = hrefFor(link.href, prefix);
                return (
                  <NavLink key={link.label} href={href} current={isCurrent(href, pathname)} icon={link.icon}>
                    {link.label}
                  </NavLink>
                );
              })}
              {authLink ? (
                <NavLink
                  href={hrefFor(authLink.href, prefix)}
                  current={isCurrent(authLink.href, pathname)}
                  icon={authLink.icon}
                  className="fp-nav-login"
                >
                  {authLink.label}
                </NavLink>
              ) : null}
            </div>
          </nav>
          <button
            ref={toggleRef}
            type="button"
            className="fp-menu-toggle"
            aria-expanded={open}
            aria-controls={menuId}
            aria-haspopup="dialog"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <span className="fp-burger" data-open={open ? "true" : "false"} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
        <div className="fp-nav-actions">
          <PlayNowLink onClick={() => trackEvent("play_clicked", { surface: "nav" })} />
        </div>
        {open ? (
          <div ref={panelRef} id={menuId} className="fp-menu" role="dialog" aria-modal="true" aria-label="Menu">
            <nav aria-label="Mobile">
              {links.map((link, index) => {
                const href = hrefFor(link.href, prefix);
                return (
                  <NavLink
                    key={link.label}
                    href={href}
                    current={isCurrent(href, pathname)}
                    icon={link.icon}
                    onClick={() => close(false)}
                    style={{ "--fp-nav-i": index } as CSSProperties}
                  >
                    {link.label}
                  </NavLink>
                );
              })}
              {authLink ? (
                <NavLink
                  href={hrefFor(authLink.href, prefix)}
                  current={isCurrent(authLink.href, pathname)}
                  icon={authLink.icon}
                  onClick={() => close(false)}
                  style={{ "--fp-nav-i": links.length } as CSSProperties}
                >
                  {authLink.label}
                </NavLink>
              ) : null}
            </nav>
            <div className="fp-menu-actions">
              <PlayNowLink onClick={() => play("nav")} />
              <button type="button" className="fp-btn fp-btn-ghost" onClick={() => close(true)}>
                Close menu
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function PlayNowLink({ onClick }: { onClick: () => void }) {
  return (
    <Link className="fp-btn fp-btn-primary fp-nav-cta" href="/play" onClick={onClick}>
      <span className="fp-nav-cta-inner">
        <Play className="fp-nav-cta-play" aria-hidden="true" strokeWidth={2.5} />
        <span className="fp-nav-cta-label">PLAY NOW</span>
        <ChevronsRight className="fp-nav-cta-chevrons" aria-hidden="true" strokeWidth={2.5} />
      </span>
    </Link>
  );
}

function NavLink({
  href,
  onClick,
  current,
  children,
  style,
  icon: Icon,
  className,
}: {
  href: string;
  onClick?: () => void;
  current?: boolean;
  children: string;
  style?: CSSProperties;
  icon?: LucideIcon;
  className?: string;
}) {
  const content: ReactNode = (
    <>
      {Icon ? <Icon className="fp-nav-icon" aria-hidden="true" strokeWidth={2} /> : null}
      <span className="fp-nav-label">{children}</span>
    </>
  );
  const classes = ["fp-nav-link", className].filter(Boolean).join(" ");

  if (href.startsWith("#") || href.startsWith("/#")) {
    return (
      <a className={classes} href={href} onClick={onClick} aria-current={current ? "page" : undefined} style={style}>
        {content}
      </a>
    );
  }
  return (
    <Link className={classes} href={href} onClick={onClick} aria-current={current ? "page" : undefined} style={style}>
      {content}
    </Link>
  );
}
