"use client";

import { useEffect } from "react";
import { trackEvent } from "@/components/analytics/track-event";

let paired = false;
let roundOpen = false;

function notePair() {
  const stage = document.querySelector("[data-phone-stage]")?.getAttribute("data-phone-stage");
  if (!stage || stage === "join") {
    paired = false;
    return;
  }
  if (paired) return;
  paired = true;
  trackEvent("phone_pairing_completed");
}

function noteRound() {
  const hud = document.querySelector("[data-fitrunner-play-hud]");
  if (!hud) return;
  if (hud.hasAttribute("hidden")) {
    roundOpen = false;
    return;
  }
  if (roundOpen) return;
  roundOpen = true;
  trackEvent("game_started", { game: "fit_run" });
}

export function PairingSignal() {
  useEffect(() => {
    notePair();
    const observer = new MutationObserver(notePair);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["data-phone-stage"] });
    return () => observer.disconnect();
  }, []);
  return null;
}

export function RoundSignal() {
  useEffect(() => {
    noteRound();
    const observer = new MutationObserver(noteRound);
    observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ["hidden"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
