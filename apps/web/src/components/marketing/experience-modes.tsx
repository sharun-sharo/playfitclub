"use client";

import Link from "next/link";
import { trackEvent } from "@/components/analytics/track-event";
import {
  LAPTOP_PLAY_PATH,
  PHONE_PLAY_PATH,
  PHONE_TV_PLAY_PATH,
} from "@/components/fitrunner-v2/phone-local-play";
import { Reveal } from "@/components/marketing/reveal";

const modes = [
  {
    id: "tv-mobile",
    href: PHONE_TV_PLAY_PATH,
    title: "TV + Mobile",
    lead: "Phone runs Fit Run and the camera. Mirror that screen to a TV.",
    detail: "Smart View, Cast, Screen Mirroring, or HDMI. No separate TV browser game.",
    cta: "Play with TV",
    image: "/marketing/play-on-mobile-tv.webp",
    alt: "Athlete running in place while a phone tracks movement and a TV shows Fit Run via screen mirroring.",
  },
  {
    id: "laptop",
    href: LAPTOP_PLAY_PATH,
    title: "Laptop",
    lead: "Browser + webcam. Game and camera stay on the laptop.",
    detail: "Open Fit Run, allow the camera, and move in frame.",
    cta: "Play on Laptop",
    image: "/marketing/play-on-laptop.webp",
    alt: "Athlete squatting in front of a laptop webcam while Fit Run plays on the laptop screen.",
  },
  {
    id: "mobile-only",
    href: PHONE_PLAY_PATH,
    title: "Mobile Only",
    lead: "Phone camera and game in portrait. No TV required.",
    detail: "Hold or prop the phone, calibrate, then jump and dodge.",
    cta: "Play on Phone",
    image: "/marketing/play-on-mobile-only.webp",
    alt: "Athlete jumping while Fit Run plays on a phone that also tracks the body with the front camera.",
  },
] as const;

function onModeClick(id: string) {
  trackEvent("play_clicked", { surface: "home-modes" });
  trackEvent("fit_run_selected", { surface: `home-${id}` });
}

export function ExperienceModes() {
  return (
    <Reveal className="fp-modes" stagger>
      {modes.map((mode) => (
        <article key={mode.id} className="fp-mode-card" data-mode={mode.id}>
          <div className="fp-mode-media">
            <img src={mode.image} alt={mode.alt} width={960} height={720} loading="lazy" decoding="async" />
          </div>
          <div className="fp-mode-body">
            <h3>{mode.title}</h3>
            <p className="fp-mode-lead">{mode.lead}</p>
            <p className="fp-mode-detail">{mode.detail}</p>
            <Link className="fp-btn fp-btn-primary" href={mode.href} onClick={() => onModeClick(mode.id)}>
              {mode.cta}
            </Link>
          </div>
        </article>
      ))}
    </Reveal>
  );
}
