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
  { href: "/gyms", label: "For Gyms" },
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

export function SiteNav({ prefix = "" }: { prefix?: "" | "/" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  function close() {
    setOpen(false);
  }

  return (
    <header className="fp-nav">
      <BrandLogo href={prefix || "/"} />
      <nav className="fp-nav-desktop" aria-label="Primary">
        {links.map((link) => {
          const href = hrefFor(link.href, prefix);
          return (
            <NavLink key={link.label} href={href} current={isCurrent(href, pathname)}>
              {link.label}
            </NavLink>
          );
        })}
        <Link className="fp-btn fp-btn-primary" href="/games" onClick={() => trackEvent("play_clicked", { surface: "nav" })}>
          Play Now
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
        <span className="fp-burger" data-open={open} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {open ? (
        <div ref={panelRef} id={menuId} className="fp-menu" role="dialog" aria-modal="true" aria-label="Mobile">
          <nav aria-label="Mobile">
            {links.map((link) => {
              const href = hrefFor(link.href, prefix);
              return (
                <NavLink key={link.label} href={href} current={isCurrent(href, pathname)} onClick={close}>
                  {link.label}
                </NavLink>
              );
            })}
            <Link
              className="fp-btn fp-btn-primary"
              href="/games"
              onClick={() => {
                trackEvent("play_clicked", { surface: "nav" });
                close();
              }}
            >
              Play Now
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

function NavLink({ href, onClick, current, children }: { href: string; onClick?: () => void; current?: boolean; children: string }) {
  if (href.startsWith("#") || href.startsWith("/#")) {
    return (
      <a href={href} onClick={onClick} aria-current={current ? "page" : undefined}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
