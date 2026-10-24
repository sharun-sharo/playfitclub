"use client";

import { useLayoutEffect } from "react";
import { ensureMotionStyles } from "@/components/marketing/motion-css";

export function MotionBoot() {
  useLayoutEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("fp-hero-seen") === "1";
    } catch {
      seen = false;
    }
    ensureMotionStyles(seen);
  }, []);

  return null;
}
