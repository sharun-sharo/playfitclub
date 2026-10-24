"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { commandsForNavigation, gaMeasurementId, sanitizeAnalyticsUrl, type PageViewCommand } from "@/lib/analytics";

const pageQueue: PageViewCommand["params"][] = [];
let flushing = false;

function beforeSend(event: BeforeSendEvent): BeforeSendEvent {
  return { ...event, url: sanitizeAnalyticsUrl(event.url) };
}

function pumpPageViews(attempt = 0) {
  if (flushing) return;
  flushing = true;
  const tick = (tries: number) => {
    if (pageQueue.length === 0 || tries > 20) {
      flushing = false;
      return;
    }
    if (typeof window.gtag !== "function") {
      window.setTimeout(() => tick(tries + 1), 250);
      return;
    }
    const next = pageQueue.shift();
    if (next) window.gtag("event", "page_view", next);
    if (pageQueue.length === 0) {
      flushing = false;
      return;
    }
    window.setTimeout(() => tick(tries), 0);
  };
  tick(attempt);
}

function queuePageView(params: PageViewCommand["params"]) {
  if (pageQueue.some((item) => item.page_path === params.page_path && item.page_location === params.page_location)) return;
  pageQueue.push(params);
  pumpPageViews();
}

function GaPageViews({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const raw = search.toString() ? `${pathname}?${search.toString()}` : pathname;
    const planned = commandsForNavigation(measurementId, raw, previous.current);
    previous.current = planned.nextKey;
    const command = planned.pageViews[0];
    if (!command) return;
    queuePageView(command.params);
  }, [measurementId, pathname, search]);

  return null;
}

export function SiteAnalytics() {
  const measurementId = gaMeasurementId();
  return (
    <>
      <Analytics beforeSend={beforeSend} />
      {measurementId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
          <Script id="playfit-ga" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${measurementId}',{send_page_view:false});`}
          </Script>
          <GaPageViews measurementId={measurementId} />
        </>
      ) : null}
    </>
  );
}
