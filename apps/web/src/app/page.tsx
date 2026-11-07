import type { Metadata } from "next";
import Link from "next/link";
import { TrackedLink } from "@/components/analytics/tracked-link";
import { PLAY_HUB_PATH } from "@/components/fitrunner-v2/phone-local-play";
import { ExperienceModes } from "@/components/marketing/experience-modes";
import { FaqList } from "@/components/marketing/faq-list";
import { GameLibrary } from "@/components/marketing/game-library";
import { HeroShowcase } from "@/components/marketing/hero-carousel";
import { MarketingFrame } from "@/components/marketing/frame";
import { motionBootScript } from "@/components/marketing/motion-css";
import { MotionBoot } from "@/components/marketing/motion-boot";
import { Reveal } from "@/components/marketing/reveal";
import { ScoreBoard } from "@/components/marketing/score-board";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { homeMetadata } from "@/lib/site-metadata";
import "@/app/marketing-home.css";

export const metadata: Metadata = homeMetadata;

const statements = [
  {
    title: "Your camera plays Fit Run.",
    copy: "Laptop webcam or phone camera tracks your body. No console. No extra sensor.",
  },
  {
    title: "Every move matters.",
    copy: "A lean changes lanes. A jump clears a low barrier. A squat slides under a high one.",
  },
  {
    title: "Three ways to play.",
    copy: "Laptop in the browser. Mobile Only on your phone. Or play on the phone and mirror that screen to a TV.",
  },
];

export default function HomePage() {
  return (
    <MarketingFrame home>
      <link rel="preload" as="image" href="/marketing/hero-run.jpg" type="image/jpeg" />
      <script dangerouslySetInnerHTML={{ __html: motionBootScript() }} />
      <MotionBoot />
      <a className="fp-skip" href="#content">
        Skip to content
      </a>
      <SiteNav logo="default" />
      <main id="content">
        <section className="fp-hero" aria-labelledby="hero-title">
          <HeroShowcase />
        </section>

        <section className="fp-section fp-statement" aria-labelledby="statement-title">
          <div className="fp-wrap">
            <Reveal>
              <h2 id="statement-title">Your workout just got a new world.</h2>
              <p className="fp-lead">Burn calories by playing at home. Step into Fit Run, where your movements drive the action.</p>
            </Reveal>
            <div className="fp-statements">
              {statements.map((item) => (
                <article key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="fp-section" id="experience" aria-labelledby="experience-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">Play modes</p>
              <h2 id="experience-title">Choose how you play.</h2>
              <p className="fp-lead">
                Three real setups. Laptop uses the browser webcam. Mobile Only keeps camera and game on the phone in portrait. TV + Mobile keeps game and camera on the phone, then mirrors that screen to a TV.
              </p>
            </Reveal>
            <ExperienceModes />
          </div>
        </section>

        <section className="fp-section" id="games" aria-labelledby="games-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">Worlds</p>
              <h2 id="games-title">Fitness has never been this fun.</h2>
              <p className="fp-lead">Fit Run is playable now on a laptop or phone. Fit Fight and Fit Dance are coming soon.</p>
            </Reveal>
            <GameLibrary variant="home" />
          </div>
        </section>

        <section className="fp-section fp-showcase" id="showcase" aria-labelledby="showcase-title">
          <div className="fp-wrap fp-showcase-grid">
            <Reveal className="fp-showcase-copy">
              <p className="fp-kicker">Inside the run</p>
              <h2 id="showcase-title">This is what movement looks like now.</h2>
              <p className="fp-lead">
                Fit Run is a 3D course in your browser. Pose stays on the device that plays. Stand so your head through your knees stay in frame, and leave room to jump and squat.
              </p>
              <p className="fp-lead">
                Jump height is an estimate from the camera, not a measurement. PlayFit Club does not give medical advice.
              </p>
              <div className="fp-actions">
                <TrackedLink
                  className="fp-btn fp-btn-primary"
                  href={PLAY_HUB_PATH}
                  events={[{ name: "play_clicked", params: { surface: "home-showcase" } }]}
                >
                  Play Now
                </TrackedLink>
              </div>
            </Reveal>
            <Reveal delay={1} className="fp-showcase-art">
              <img
                src="/marketing/fit-run-coast-key-art.jpg"
                alt="Fit Run key art: a coastal 3D course with neon accents, showing the motion-controlled running world."
                width={1024}
                height={576}
                loading="lazy"
                decoding="async"
              />
              <img
                className="fp-showcase-secondary"
                src="/marketing/watch-gameplay.jpg"
                alt="Illustrated Fit Run gameplay on a large screen with a phone in front for camera tracking."
                width={1024}
                height={576}
                loading="lazy"
                decoding="async"
              />
            </Reveal>
          </div>
        </section>

        <section className="fp-section" id="how-it-works" aria-labelledby="how-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">How it works</p>
              <h2 id="how-title">Open. Calibrate. Move.</h2>
              <p className="fp-lead">
                Fit Run runs in the browser on a laptop or phone. PlayFit Club reads movement for the game. It does not give medical advice.
              </p>
            </Reveal>
            <Reveal className="fp-steps" stagger>
              <article>
                <p className="fp-step-no">Step 01</p>
                <h3>Pick a mode</h3>
                <p>Laptop, Mobile Only, or TV + Mobile. Each mode opens the matching Fit Run route.</p>
              </article>
              <article>
                <p className="fp-step-no">Step 02</p>
                <h3>Allow the camera</h3>
                <p>Grant access on that device. Stand so your body fits from head through knees.</p>
              </article>
              <article>
                <p className="fp-step-no">Step 03</p>
                <h3>Play with your body</h3>
                <p>Lean to change lanes. Jump to clear low barriers. Squat to slide under high ones.</p>
              </article>
            </Reveal>
            <div className="fp-help">
              <article>
                <h3>What you need</h3>
                <ul>
                  <li>A laptop webcam, or a phone with a front camera, in the browser or installed page.</li>
                  <li>Your full body in frame from head through knees.</li>
                  <li>Good light, and space to jump and squat.</li>
                </ul>
              </article>
              <article>
                <h3>If the camera misses you</h3>
                <ul>
                  <li>Allow the camera when the browser asks.</li>
                  <li>Use the browser or the installed page on that device.</li>
                  <li>Step back until your body fits from head through knees.</li>
                  <li>Use good light and leave space to jump and squat.</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="fp-section" aria-labelledby="benefits-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">Why come back</p>
              <h2 id="benefits-title">More play. More movement.</h2>
            </Reveal>
            <Reveal className="fp-benefits" stagger>
              <article>
                <h3>Move to play</h3>
                <p>In Fit Run, a lean, a jump, and a squat are how you play.</p>
              </article>
              <article>
                <h3>Chase the score</h3>
                <p>Burn calories by playing at home. Signed-in players can keep a personal best.</p>
              </article>
              <article>
                <h3>Bigger picture, same phone</h3>
                <p>Want a TV view? Mirror the phone with Smart View, Cast, Screen Mirroring, or HDMI.</p>
              </article>
              <article>
                <h3>One play device</h3>
                <p>The laptop or phone runs the game and camera. Mirroring only copies that phone screen.</p>
              </article>
            </Reveal>
          </div>
        </section>

        <section className="fp-section" id="gyms" aria-labelledby="ways-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">Home and gyms</p>
              <h2 id="ways-title">One experience. More ways in.</h2>
            </Reveal>
            <div className="fp-ways">
              <article className="fp-panel">
                <h3>Turn your space into a playground.</h3>
                <p>Play Fit Run at home on a laptop or phone. The free demo does not need an account.</p>
                <TrackedLink
                  className="fp-btn fp-btn-primary"
                  href={PLAY_HUB_PATH}
                  events={[{ name: "play_clicked", params: { surface: "home" } }]}
                >
                  Play Now
                </TrackedLink>
              </article>
              <article className="fp-panel">
                <h3>Accounts for members who play at home.</h3>
                <p>
                  A gym buys member accounts. Each member plays Fit Run on their own laptop or phone. Gym Starter covers
                  up to 49 accounts. Gym Pro covers 50 to 99.
                </p>
                <Link className="fp-btn fp-btn-ghost" href="/for-gyms">
                  For gyms
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section className="fp-section" aria-labelledby="score-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">Competition</p>
              <h2 id="score-title">Your next high score is waiting.</h2>
              <p className="fp-lead">
                Scores, personal bests, and achievements are real for finished rounds. A public daily challenge is not.
                Nothing below is invented.
              </p>
            </Reveal>
            <div className="fp-section-gap">
              <ScoreBoard />
            </div>
          </div>
        </section>

        <section className="fp-section" id="faq" aria-labelledby="faq-title">
          <div className="fp-wrap fp-split">
            <Reveal>
              <p className="fp-kicker">Questions</p>
              <h2 id="faq-title">Before you jump in.</h2>
            </Reveal>
            <FaqList />
          </div>
        </section>

        <section className="fp-final" aria-labelledby="final-title">
          <Reveal>
            <div className="fp-wrap">
              <h2 id="final-title">Your next workout won&apos;t feel like a workout.</h2>
              <p className="fp-lead">Open Fit Run on a laptop or phone. Move with purpose. Make every session an experience.</p>
              <div className="fp-actions">
                <TrackedLink
                  className="fp-btn fp-btn-primary"
                  href={PLAY_HUB_PATH}
                  events={[{ name: "play_clicked", params: { surface: "home" } }]}
                >
                  Play Now
                </TrackedLink>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </MarketingFrame>
  );
}
