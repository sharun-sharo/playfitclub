"use client";

import { CirclePlay, Play, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { trackEvent } from "@/components/analytics/track-event";
import { PHONE_PLAY_PATH, PHONE_PLAY_URL } from "@/components/fitrunner-v2/phone-local-play";
import { HeroPicture } from "@/components/marketing/hero-picture";

const games = [
  {
    title: "Fit Run",
    description: "Play on your phone, then mirror that phone screen",
    status: "Available",
    href: PHONE_PLAY_PATH,
    image: "/marketing/fit-run.jpg",
    alt: "A woman runs in a living room toward a television showing a motion-controlled running game, with a phone tracking her pose.",
  },
  {
    title: "Fit Fight",
    description: "Interactive boxing",
    status: "Coming soon",
    href: null,
    image: "/marketing/fit-fight.jpg",
    alt: "A man punches a heavy bag in front of a television showing an interactive boxing game, with a phone tracking his pose.",
  },
  {
    title: "Fit Dance",
    description: "Follow-the-instructor dance fitness",
    status: "Coming soon",
    href: null,
    image: "/marketing/fit-dance.jpg",
    alt: "A woman dances in a living room toward a television showing a follow-the-instructor dance game, with a phone tracking her pose.",
  },
] as const;

const statements = [
  { title: "Your body. Your controls.", copy: "The phone camera is the controller. No console and no extra sensor." },
  { title: "Every move matters.", copy: "A lean changes lanes. A jump clears a low barrier. A squat slides under a high one." },
  { title: "Play your way.", copy: "Play on your phone, then mirror that phone screen to the TV or laptop." },
] as const;

const slides = [
  {
    id: "run",
    name: "Run",
    jpeg: "/marketing/hero-run.jpg",
    png: "/marketing/hero-run.png",
    alt: "Illustrated home-play scene. A woman jogs in a living room. The television banner reads Run, Move forward.",
  },
  {
    id: "jump",
    name: "Jump",
    jpeg: "/marketing/hero-jump.jpg",
    png: "/marketing/hero-jump.png",
    alt: "Illustrated home-play scene. A woman jumps in a living room. The television banner reads Jump, Leap over.",
  },
  {
    id: "squat",
    name: "Squat",
    jpeg: "/marketing/hero-squat.jpg",
    png: "/marketing/hero-squat.png",
    alt: "Illustrated home-play scene. A woman squats in a living room. The television banner reads Squat, Duck under.",
  },
] as const;

export function TvHome() {
  const [index, setIndex] = useState(0);
  const active = slides[index] ?? slides[0];

  function go(next: number) {
    setIndex((next + slides.length) % slides.length);
  }

  return (
    <div className="tv-site">
      <header className="tv-bar">
        <img src="/marketing/playfit-club-logo.png" alt="PlayFit Club" width={220} height={48} />
        <Link className="tv-login" href="/login?next=/tv">
          Login
        </Link>
      </header>
      <main className="tv-hero">
        <div className="tv-copy">
          <h1>
            <span>You Move.</span>
            <span>The Game Moves.</span>
          </h1>
          <p className="tv-lead">No buttons. No controllers. Just your body in action.</p>
          <p className="tv-sub">Turn your workout into an adventure.</p>
          <p className="tv-body">
            Run, fight, dance and play exciting fitness games using your body movements. Play on your phone, then mirror that phone screen to the TV or laptop.
          </p>
          <p className="tv-note">The game is on your phone. {PHONE_PLAY_URL}</p>
          <p className="tv-note">Smart View, Cast, or Screen Mirroring shows this phone screen. The game is on the phone.</p>
          <div className="tv-actions">
            <Link
              className="tv-btn tv-btn-primary"
              href={PHONE_PLAY_PATH}
              autoFocus
              onClick={() => {
                trackEvent("play_clicked", { surface: "tv" });
                trackEvent("fit_run_selected", { surface: "tv" });
              }}
            >
              <Play aria-hidden="true" />
              Play on your phone
            </Link>
            <Link className="tv-btn tv-btn-dark" href="/gyms">
              <Users aria-hidden="true" />
              For gyms
            </Link>
            <Link className="tv-btn tv-btn-ghost" href="/#experience">
              <CirclePlay aria-hidden="true" />
              Watch how it works
            </Link>
          </div>
        </div>
        <figure className="tv-stage">
          <HeroPicture jpeg={active.jpeg} png={active.png} alt={active.alt} priority={active.id === "run"} />
          <div className="tv-dots">
            {slides.map((item, itemIndex) => (
              <button key={item.id} type="button" aria-label={`Show ${item.name}`} aria-current={itemIndex === index ? "true" : undefined} onClick={() => go(itemIndex)} />
            ))}
          </div>
          <button className="tv-arrow tv-arrow-prev" type="button" aria-label="Previous picture" onClick={() => go(index - 1)}>
            ‹
          </button>
          <button className="tv-arrow tv-arrow-next" type="button" aria-label="Next picture" onClick={() => go(index + 1)}>
            ›
          </button>
        </figure>
      </main>
      <div className="tv-worlds">
          <section className="tv-statement">
            <div className="tv-statements">
              {statements.map((item) => (
                <article key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="tv-games" id="games" aria-labelledby="tv-games-title">
            <h2 id="tv-games-title">Your Move.</h2>
            <p className="tv-worlds-lead">Fit Run is available now. Fit Fight and Fit Dance are coming soon.</p>
            <Link className="tv-btn tv-btn-ghost" href="/games">
              See the experience
            </Link>
            <div className="tv-cards">
              {games.map((game) => (
                <article key={game.title} className="tv-card">
                  <div className="tv-card-visual">
                    {game.href ? (
                      <Link href={game.href}>
                        <img src={game.image} alt={game.alt} />
                      </Link>
                    ) : (
                      <img src={game.image} alt={game.alt} />
                    )}
                    <span className={game.status === "Coming soon" ? "tv-card-soon" : undefined}>{game.status}</span>
                  </div>
                  <div className="tv-card-copy">
                    <h3>{game.title}</h3>
                    <p>{game.description}</p>
                    {game.href ? (
                      <Link
                        className="tv-btn tv-btn-primary"
                        href={game.href}
                        onClick={() => {
                          trackEvent("play_clicked", { surface: "tv" });
                          trackEvent("fit_run_selected", { surface: "tv" });
                        }}
                      >
                        Play
                      </Link>
                    ) : (
                      <button className="tv-btn tv-btn-ghost" type="button" disabled>
                        Coming soon
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
      </div>
      <footer className="tv-foot">
        <img src="/marketing/playfit-club-logo-footer.png" alt="PlayFit Club" width={180} height={40} />
        <p>Move your body. Play your world.</p>
      </footer>
    </div>
  );
}
