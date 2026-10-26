"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { trackEvent } from "@/components/analytics/track-event";
import { BrandLogo } from "@/components/marketing/brand-logo";
import { isSuperAdminRole } from "@fitplay/shared";

interface Me {
  user: { displayName: string; role: string } | null;
}

const baseLinks = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Experience" },
  { href: "/#how-it-works", label: "How It Works" },
  { href: "/gyms", label: "For Gyms" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/me")
      .then((response) => response.json())
      .then((body: Me) => setMe(body))
      .catch(() => setMe({ user: null }));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
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
    const first = panelRef.current?.querySelector<HTMLElement>("a, button");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const links = me?.user
    ? [
        ...baseLinks,
        { href: "/dashboard", label: "Account" },
        ...(isSuperAdminRole(me.user.role) ? [{ href: "/admin", label: "Admin" }] : []),
      ]
    : [...baseLinks, { href: "/login", label: "Login" }];
  const cta = me?.user
    ? { href: "/play/phone", label: "Play", external: false }
    : { href: "/games", label: "Play Now", external: false };

  function close() {
    setOpen(false);
  }

  return (
    <header className="fp-nav">
      <BrandLogo />
      <nav className="fp-nav-desktop" aria-label="Primary">
        {links.map((link) => (
          <NavLink key={link.label} href={link.href}>
            {link.label}
          </NavLink>
        ))}
        <Cta href={cta.href} external={cta.external} onClick={() => trackEvent("play_clicked", { surface: "header" })}>{cta.label}</Cta>
      </nav>
      <button
        ref={toggleRef}
        type="button"
        className="fp-menu-toggle"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        <span className="fp-burger" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {open ? (
        <div ref={panelRef} id={menuId} className="fp-menu" role="dialog" aria-modal="true" aria-label="Mobile">
          <nav aria-label="Mobile">
            {links.map((link) => (
              <NavLink key={link.label} href={link.href} onClick={close}>
                {link.label}
              </NavLink>
            ))}
            <Cta href={cta.href} external={cta.external} onClick={() => { trackEvent("play_clicked", { surface: "header" }); close(); }}>{cta.label}</Cta>
          </nav>
          <button type="button" className="fp-btn fp-btn-ghost" onClick={close}>
            Close menu
          </button>
        </div>
      ) : null}
    </header>
  );
}

function Cta({ href, external, onClick, children }: { href: string; external: boolean; onClick?: () => void; children: string }) {
  if (external) {
    return (
      <a className="fp-btn fp-btn-primary" href={href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link className="fp-btn fp-btn-primary" href={href} onClick={onClick}>
      {children}
    </Link>
  );
}

function NavLink({ href, onClick, children }: { href: string; onClick?: () => void; children: string }) {
  if (href.startsWith("/#")) {
    return (
      <a href={href} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick}>
      {children}
    </Link>
  );
}
