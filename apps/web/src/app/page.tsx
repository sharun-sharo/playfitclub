import type { Metadata } from "next";
import Link from "next/link";
import { TrackedLink } from "@/components/analytics/tracked-link";
import { GameLibrary } from "@/components/marketing/game-library";
import { GameplayPoster } from "@/components/marketing/gameplay-poster";
import { HeroShowcase } from "@/components/marketing/hero-carousel";
import { MarketingFrame } from "@/components/marketing/frame";
import { motionBootScript } from "@/components/marketing/motion-css";
import { MotionBoot } from "@/components/marketing/motion-boot";
import { Reveal } from "@/components/marketing/reveal";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { homeMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = homeMetadata;

const homeBenefits = ["No gaming console required.", "Phone camera tracks your movements.", "Play directly on your phone.", "Mirror to a compatible TV for a bigger experience.", "Enjoy interactive fitness challenges."];

const gymBenefits = ["Interactive workout experiences.", "A distinctive gym attraction.", "Trainer-led fitness challenges.", "Potential for member engagement.", "Easy mobile-first setup."];

const steps = [
  { n: "Step 1", title: "OPEN THE GAME", copy: "Open PlayFit Club on your compatible smartphone." },
  { n: "Step 2", title: "ENABLE YOUR CAMERA", copy: "Allow camera access and position yourself where your body is visible." },
  { n: "Step 3", title: "MOVE TO PLAY", copy: "Jump, squat, and move left or right to control the character." },
  { n: "Step 4", title: "GO BIG SCREEN", copy: "Optionally mirror your phone screen to a compatible TV." },
];

export default function HomePage() {
  return (
    <MarketingFrame>
      <link rel="preload" as="image" href="/marketing/hero-run.jpg" type="image/jpeg" />
      <script dangerouslySetInnerHTML={{ __html: motionBootScript() }} />
      <MotionBoot />
      <a className="fp-skip" href="#content">
        Skip to content
      </a>
      <SiteNav />
      <main id="content">
        <section className="fp-wrap fp-hero" aria-labelledby="hero-title">
          <HeroShowcase />
        </section>

        <section className="fp-section" aria-labelledby="ways-title">
          <div className="fp-wrap">
            <Reveal>
              <h2 id="ways-title" className="fp-wide">
                ONE GAME. TWO WAYS TO EXPERIENCE IT.
              </h2>
            </Reveal>
            <div className="fp-duo">
              <article className="fp-card">
                <p className="fp-kicker">Play at home</p>
                <h3>Turn Your Living Room Into a Playground.</h3>
                <p>Get moving, challenge yourself, and experience fitness through gaming — right from your phone.</p>
                <ul>
                  {homeBenefits.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <TrackedLink className="fp-btn fp-btn-primary" href="/play/phone" events={[{ name: "play_clicked", params: { surface: "home" } }]}>
                  Start Playing Free
                </TrackedLink>
              </article>
              <article className="fp-card">
                <p className="fp-kicker">PlayFit for gyms</p>
                <h3>Give Your Members a Reason to Move More.</h3>
                <p>Bring interactive fitness gaming to your gym. Turn traditional workout sessions into engaging, competitive experiences.</p>
                <ul>
                  {gymBenefits.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Link className="fp-btn fp-btn-ghost" href="/for-gyms">
                  Explore Gym Solutions
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section className="fp-section" id="how-it-works" aria-labelledby="how-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">How it works</p>
              <h2 id="how-title" className="fp-wide">
                Open it on your phone.
              </h2>
              <p className="fp-lead">A compatible TV can show the phone screen if you choose to mirror it. Mirroring is not automatic.</p>
            </Reveal>
            <div className="fp-step-grid">
              {steps.map((step) => (
                <article key={step.n}>
                  <p className="fp-kicker">{step.n}</p>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </article>
              ))}
            </div>
            <p className="fp-muted fp-mirror-note">Mirror with Smart View, Cast, Screen Mirroring, or HDMI when you want a bigger picture.</p>
          </div>
        </section>

        <section className="fp-section" id="games" aria-labelledby="games-title">
          <div className="fp-wrap">
            <Reveal>
              <h2 id="games-title" className="fp-wide">
                FITNESS HAS NEVER BEEN THIS FUN.
              </h2>
              <p className="fp-lead">Fit Run is available now. Fit Fight and Fit Dance are coming soon.</p>
            </Reveal>
            <GameLibrary />
          </div>
        </section>

        <section className="fp-section" aria-labelledby="watch-title">
          <div className="fp-wrap">
            <Reveal>
              <h2 id="watch-title" className="fp-wide">
                DON&apos;T JUST WATCH. GET IN THE GAME.
              </h2>
            </Reveal>
            <GameplayPoster />
            <div className="fp-actions">
              <TrackedLink className="fp-btn fp-btn-primary" href="/play/phone" events={[{ name: "play_clicked", params: { surface: "home" } }]}>
                Play Free
              </TrackedLink>
              <Link className="fp-btn fp-btn-ghost" href="/pricing">
                See pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </MarketingFrame>
  );
}
