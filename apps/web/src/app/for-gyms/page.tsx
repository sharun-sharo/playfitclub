import type { Metadata } from "next";
import Link from "next/link";
import { GameplayPoster } from "@/components/marketing/gameplay-poster";
import { GymEnquiry } from "@/components/marketing/gym-enquiry";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { gymsMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = gymsMetadata;

const reasons = [
  { title: "Engaging workout environment", copy: "Members play Fit Run with their own movement, on a phone." },
  { title: "Gamified cardio", copy: "A run, a jump, and a squat are the controls for the session." },
  { title: "Interactive member challenges", copy: "Scores and a gym leaderboard give a session something to chase." },
  { title: "Differentiate the gym", copy: "PlayFit Club is a phone game you can offer alongside the floor." },
  { title: "A new fitness experience", copy: "The same game people can open at home, introduced in the gym." },
];

const gymSteps = [
  "Use a compatible phone and a display.",
  "Launch PlayFit Club.",
  "Position the player so the camera sees their body.",
  "Start the game.",
  "Members take part.",
];

const places = ["Independent gyms", "Premium fitness studios", "Personal training centers", "Fitness clubs", "Corporate wellness spaces"];

export default function ForGymsPage() {
  return (
    <MarketingFrame classic>
      <SiteNav prefix="/" />
      <main>
        <section className="fp-wrap fp-page" aria-labelledby="gym-hero-title">
          <p className="fp-kicker">For gyms</p>
          <h1 id="gym-hero-title" className="fp-wide">
            THE NEXT GENERATION OF GYM ENTERTAINMENT.
          </h1>
          <p className="fp-lead">Transform your gym into an interactive fitness destination with motion-powered games that make movement exciting.</p>
          <div className="fp-actions">
            <a className="fp-btn fp-btn-primary" href="#demo">
              Book a Free Demo
            </a>
            <a className="fp-btn fp-btn-ghost" href="#watch">
              Watch Gameplay
            </a>
          </div>
        </section>

        <section className="fp-section" aria-labelledby="why-title">
          <div className="fp-wrap">
            <h2 id="why-title" className="fp-wide">
              Why gyms
            </h2>
            <div className="fp-ideal">
              {reasons.map((item) => (
                <article key={item.title} className="fp-card">
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="fp-section" aria-labelledby="gym-how-title">
          <div className="fp-wrap">
            <h2 id="gym-how-title" className="fp-wide">
              How it works in a gym
            </h2>
            <ol className="fp-ordered">
              {gymSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="fp-muted">A bigger screen needs the phone’s own mirror: Smart View, Cast, Screen Mirroring, or HDMI. That step is optional and not automatic.</p>
          </div>
        </section>

        <section className="fp-section" aria-labelledby="ideal-title">
          <div className="fp-wrap">
            <h2 id="ideal-title">Ideal for</h2>
            <ul className="fp-places">
              {places.map((place) => (
                <li key={place}>{place}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="fp-section" aria-labelledby="gym-watch-title">
          <div className="fp-wrap">
            <h2 id="gym-watch-title" className="fp-wide">
              DON&apos;T JUST WATCH. GET IN THE GAME.
            </h2>
            <GameplayPoster />
          </div>
        </section>

        <section className="fp-section" aria-labelledby="plans-title">
          <div className="fp-wrap">
            <h2 id="plans-title">Listed gym subscriptions</h2>
            <div className="fp-duo">
              <article className="fp-card">
                <h3>Gym Starter</h3>
                <p className="fp-price">₹19,999</p>
                <p>Up to 49 member accounts.</p>
              </article>
              <article className="fp-card">
                <h3>Gym Pro</h3>
                <p className="fp-price">₹39,999</p>
                <p>50 to 99 member accounts.</p>
              </article>
            </div>
            <p className="fp-muted">These are the listed subscription prices. This page does not take payment or start a plan. Fit Fight and Fit Dance are coming soon.</p>
            <p>
              <Link className="fp-text-link" href="/pricing">
                See pricing
              </Link>
            </p>
          </div>
        </section>

        <section className="fp-section" aria-labelledby="enquiry-title">
          <div className="fp-wrap fp-split">
            <div>
              <h2 id="enquiry-title" className="fp-wide">
                READY TO BRING FITNESS GAMING TO YOUR GYM?
              </h2>
              <p className="fp-lead">Tell us about the gym. The form opens WhatsApp so the message can be sent.</p>
            </div>
            <GymEnquiry />
          </div>
        </section>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
