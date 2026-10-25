"use client";

import { useEffect } from "react";
import { isTelevisionUserAgent } from "@/components/fitrunner-v2/tv-graphics";
import { gameOwnsArrows, isTvBackKey, moveFocusWithin } from "@/app/tv/tv-remote";

/** Arrow and Back keys for the laptop pages when a television browser opens them. */
export function ScreenRemote() {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (document.querySelector("[data-tv-shell]")) return;
      if (!isTelevisionUserAgent(navigator.userAgent)) return;
      if (isTvBackKey(event)) {
        if (window.history.length > 1) {
          event.preventDefault();
          window.history.back();
        }
        return;
      }
      if (event.defaultPrevented || gameOwnsArrows()) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      event.preventDefault();
      moveFocusWithin(document.body, event.key);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
