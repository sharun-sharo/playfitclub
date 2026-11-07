"use client";

import Link from "next/link";
import { trackEvent } from "@/components/analytics/track-event";
import { LAPTOP_PLAY_PATH, PHONE_PLAY_PATH, PHONE_TV_PLAY_PATH } from "@/components/fitrunner-v2/phone-local-play";

const CARDS = [
  {
    id: "laptop",
    href: LAPTOP_PLAY_PATH,
    title: "Play on Laptop",
    description: "The game runs directly in your browser. Your laptop webcam tracks your body movements — no extra devices needed.",
    camera: "Laptop webcam",
    screen: "Laptop",
    cta: "Play on Laptop",
    image: "/marketing/play-on-laptop.webp",
    alt: "Someone exercising in front of a laptop webcam with Fit Run displayed on the laptop screen.",
  },
  {
    id: "mobile-only",
    href: PHONE_PLAY_PATH,
    title: "Mobile Only",
    description:
      "Your phone camera tracks you and the game runs on the phone screen — no TV required.",
    camera: "Phone",
    screen: "Phone",
    cta: "Play on Phone",
    image: "/marketing/play-on-mobile-only.webp",
    alt: "Someone exercising in front of a large phone showing Fit Run and a skeleton tracking overlay on the phone screen.",
  },
  {
    id: "mobile",
    href: PHONE_TV_PLAY_PATH,
    title: "Play on Mobile & TV",
    description:
      "The game runs on your phone and uses the phone camera to track your moves. Optionally mirror your phone screen to a TV with Smart View, Cast, AirPlay, or HDMI — PlayFit does not cast a separate stream.",
    camera: "Phone",
    screen: "TV",
    cta: "Play on TV",
    image: "/marketing/play-on-mobile-tv.webp",
    alt: "Someone running in place while a phone on a tripod tracks their body; a TV shows the game via optional screen mirroring.",
  },
] as const;

const HOW_IT_WORKS = [
  { step: "1", title: "Allow Camera", detail: "Grant access when prompted" },
  { step: "2", title: "Stand in Frame", detail: "Center yourself and calibrate" },
  { step: "3", title: "Start Playing", detail: "Move — your body is the controller" },
] as const;

function onChoose() {
  trackEvent("play_clicked", { surface: "play" });
  trackEvent("fit_run_selected", { surface: "play" });
}

export function ChooseHowYouPlay() {
  return (
    <main className="fp-choose" data-play-chooser="">
      <div className="fp-choose-glow" aria-hidden="true" />
      <header className="fp-choose-header">
        <p className="fp-choose-brand">PLAYFIT CLUB</p>
        <h1 className="fp-choose-title">Choose Your Play Mode</h1>
        <p className="fp-choose-lead">No controllers. No wearables. Just you and your movements.</p>
      </header>

      <div className="fp-choose-grid" role="list">
        {CARDS.map((card, index) => (
          <article
            key={card.id}
            className="fp-choose-card"
            data-choose-card={card.id}
            role="listitem"
            style={{ animationDelay: `${120 + index * 90}ms` }}
          >
            <div className="fp-choose-media">
              <img src={card.image} alt={card.alt} width={960} height={720} decoding="async" />
            </div>
            <div className="fp-choose-body">
              <h2>{card.title}</h2>
              <p>{card.description}</p>
              <dl className="fp-choose-specs">
                <div>
                  <dt>Camera</dt>
                  <dd>{card.camera}</dd>
                </div>
                <div>
                  <dt>Screen</dt>
                  <dd>{card.screen}</dd>
                </div>
              </dl>
              <Link className="fp-choose-cta" href={card.href} onClick={() => onChoose()}>
                {card.cta}
              </Link>
            </div>
          </article>
        ))}
      </div>

      <section className="fp-choose-how" aria-labelledby="fp-choose-how-title">
        <h2 id="fp-choose-how-title" className="fp-choose-how-title">
          How It Works
        </h2>
        <ol className="fp-choose-how-list">
          {HOW_IT_WORKS.map((item) => (
            <li key={item.step} className="fp-choose-how-item">
              <span className="fp-choose-how-step" aria-hidden="true">
                {item.step}
              </span>
              <div>
                <p className="fp-choose-how-name">{item.title}</p>
                <p className="fp-choose-how-detail">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
