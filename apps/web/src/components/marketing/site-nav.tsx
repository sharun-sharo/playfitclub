"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { trackEvent } from "@/components/analytics/track-event";
import { BrandLogo } from "@/components/marketing/brand-logo";

const links = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Experience" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/for-gyms", label: "For Gyms" },
  { href: "/pricing", label: "Pricing" },
  { href: "/login", label: "Login" },
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
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreScroll = useRef(true);

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

  return (
    <header className="fp-nav fp-nav-market">
      <div className="fp-announce">
        <p>
          <span className="fp-announce-text">PlayFit Club is coming to iOS & Android!</span>
          <span className="fp-announce-label">Launching Soon</span>
        </p>
      </div>
      <div className="fp-nav-bar">
        <BrandLogo href={prefix || "/"} variant={logo} />
        <nav className="fp-nav-desktop" aria-label="Primary">
          {links.map((link) => {
            const href = hrefFor(link.href, prefix);
            return (
              <NavLink key={link.label} href={href} current={isCurrent(href, pathname)}>
                {link.label}
              </NavLink>
            );
          })}
          <Link className="fp-btn fp-btn-primary fp-nav-cta" href="/games" onClick={() => trackEvent("play_clicked", { surface: "nav" })}>
            Play Now
          </Link>
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
        {open ? (
          <div ref={panelRef} id={menuId} className="fp-menu" role="dialog" aria-modal="true" aria-label="Menu">
            <nav aria-label="Mobile">
              {links.map((link) => {
                const href = hrefFor(link.href, prefix);
                return (
                  <NavLink key={link.label} href={href} current={isCurrent(href, pathname)} onClick={() => close(false)}>
                    {link.label}
                  </NavLink>
                );
              })}
            </nav>
            <div className="fp-menu-actions">
              <Link className="fp-btn fp-btn-primary fp-nav-cta" href="/games" onClick={() => play("nav")}>
                Play Now
              </Link>
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

function NavLink({ href, onClick, current, children }: { href: string; onClick?: () => void; current?: boolean; children: string }) {
  if (href.startsWith("#") || href.startsWith("/#")) {
    return (
      <a className="fp-nav-link" href={href} onClick={onClick} aria-current={current ? "page" : undefined}>
        {children}
      </a>
    );
  }
  return (
    <Link className="fp-nav-link" href={href} onClick={onClick} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
