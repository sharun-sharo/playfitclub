"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { AnalyticsEventName } from "@/lib/analytics";
import { trackEvent } from "@/components/analytics/track-event";

export interface TrackedEvent {
  name: AnalyticsEventName;
  params?: Record<string, string>;
}

export function TrackedLink({
  href,
  className,
  children,
  events,
  onClick,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  events: TrackedEvent[];
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        for (const event of events) trackEvent(event.name, event.params);
        onClick?.();
      }}
    >
      {children}
    </Link>
  );
}

export function TrackedExternal({
  href,
  className,
  children,
  events,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  events: TrackedEvent[];
}) {
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        for (const event of events) trackEvent(event.name, event.params);
      }}
    >
      {children}
    </a>
  );
}
