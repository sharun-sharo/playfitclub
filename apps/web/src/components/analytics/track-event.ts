"use client";

import { track } from "@vercel/analytics";
import { buildEvent, gaMeasurementId, type AnalyticsEventName } from "@/lib/analytics";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(name: AnalyticsEventName, params: Record<string, unknown> = {}) {
  const event = buildEvent(name, params);
  if (!event) return;
  track(event.name, event.params);
  if (!gaMeasurementId()) return;
  window.gtag?.("event", event.name, event.params);
}
