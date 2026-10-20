"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

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
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>("a, button");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  const links = me?.user
    ? [
        ...baseLinks,
        { href: "/dashboard", label: "Account" },
        ...(me.user.role === "ADMIN" ? [{ href: "/admin", label: "Admin" }] : []),
      ]
    : [...baseLinks, { href: "/login", label: "Login" }];
  const cta = me?.user ? { href: "/play", label: "Play" } : { href: "/register", label: "Get Started" };

  function close() {
    setOpen(false);
  }

  return (
    <header className="fp-nav">
      <Link href="/" className="fp-logo" aria-label="PlayFit Club home">
        <span className="fp-mark" aria-hidden="true" />
        PlayFit Club
      </Link>
      <nav className="fp-nav-desktop" aria-label="Primary">
        {links.map((link) => (
          <NavLink key={link.label} href={link.href}>
            {link.label}
          </NavLink>
        ))}
        <Link className="fp-btn fp-btn-primary" href={cta.href}>
          {cta.label}
        </Link>
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
            <Link className="fp-btn fp-btn-primary" href={cta.href} onClick={close}>
              {cta.label}
            </Link>
          </nav>
          <button type="button" className="fp-btn fp-btn-ghost" onClick={close}>
            Close menu
          </button>
        </div>
      ) : null}
    </header>
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
