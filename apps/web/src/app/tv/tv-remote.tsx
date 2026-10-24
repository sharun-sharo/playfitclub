"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

function gameOwnsArrows() {
  const canvas = document.querySelector<HTMLCanvasElement>("[data-fitrunner-v2]");
  if (!canvas) return false;
  if (canvas.dataset.tutorialKeys === "1") return true;
  const hud = document.querySelector("[data-fitrunner-play-hud]");
  return Boolean(hud && !hud.hasAttribute("hidden"));
}

function focusableControls(root: ParentNode) {
  return [...root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((element) => {
    if (element.getAttribute("aria-hidden") === "true" || element.tabIndex < 0) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none";
  });
}

function moveTvFocus(key: ArrowKey) {
  const root = document.querySelector("[data-tv-shell]");
  if (!root) return;
  const items = focusableControls(root);
  if (items.length === 0) return;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const current = active && items.includes(active) ? active.getBoundingClientRect() : null;
  if (!current) {
    items[0]?.focus();
    return;
  }
  const cx = current.left + current.width / 2;
  const cy = current.top + current.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const element of items) {
    if (element === active) continue;
    const rect = element.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - cx;
    const dy = rect.top + rect.height / 2 - cy;
    if (key === "ArrowLeft" && dx >= -8) continue;
    if (key === "ArrowRight" && dx <= 8) continue;
    if (key === "ArrowUp" && dy >= -8) continue;
    if (key === "ArrowDown" && dy <= 8) continue;
    const primary = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dx) : Math.abs(dy);
    const secondary = key === "ArrowLeft" || key === "ArrowRight" ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 2;
    if (score < bestScore) {
      bestScore = score;
      best = element;
    }
  }
  best?.focus({ preventScroll: false });
  best?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function focusPrimary() {
  const shell = document.querySelector("[data-tv-shell]");
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body && shell?.contains(active)) return;
  const first = shell?.querySelector<HTMLElement>("a[href]:not([data-tv-aux]), button:not([disabled]):not([data-tv-aux])");
  first?.focus();
}

export function TvRemote() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      focusPrimary();
      const active = document.activeElement;
      const shell = document.querySelector("[data-tv-shell]");
      if (active instanceof HTMLElement && active !== document.body && shell?.contains(active)) return;
      if (tries++ < 24) timer = window.setTimeout(attempt, 150);
    };
    attempt();
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "GoBack" || event.key === "BrowserBack") {
        if (pathname === "/tv/play" || pathname.startsWith("/tv/play/")) {
          event.preventDefault();
          router.push("/tv");
        }
        return;
      }
      if (event.defaultPrevented) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (gameOwnsArrows()) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      event.preventDefault();
      moveTvFocus(event.key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);

  return null;
}
