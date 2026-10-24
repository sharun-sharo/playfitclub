"use client";

import { useEffect } from "react";
import { trackEvent } from "@/components/analytics/track-event";

let seenAt = 0;

export function PricingViewed() {
  useEffect(() => {
    const now = Date.now();
    if (now - seenAt < 1500) return;
    seenAt = now;
    trackEvent("pricing_viewed");
  }, []);
  return null;
}
