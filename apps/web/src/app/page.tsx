import type { Metadata } from "next";
import Link from "next/link";
import { TrackedLink } from "@/components/analytics/tracked-link";
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

export const metadata: Metadata = homeMetadata;

const statements = [
  { title: "Your camera plays Fit Run.", copy: "Laptop webcam or phone camera tracks your body. There is no console and no extra sensor." },
  { title: "Every move matters.", copy: "Step or lean to change lanes. A jump clears a low barrier. A squat slides under a high one." },
  { title: "Three ways to play.", copy: "Laptop in the browser. Mobile Only on your phone. Or play on the phone and mirror that screen to a TV." },
];

const moves = ["Run", "Jump", "Dodge", "Move"];

export default function HomePage() {
  return (
    <MarketingFrame classic>
      <link rel="preload" as="image" href="/marketing/hero-run-adventure.jpg" type="image/jpeg" />
      <script dangerouslySetInnerHTML={{ __html: motionBootScript() }} />
      <MotionBoot />
      <a className="fp-skip" href="#content">
        Skip to content
      </a>
      <SiteNav logo="footer" />
      <main id="content">
        <section className="fp-hero" aria-labelledby="hero-title">
          <div className="fp-wrap">
            <HeroShowcase />
          </div>
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

        <section className="fp-section" id="games" aria-labelledby="games-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">Worlds</p>
              <h2 id="games-title">FITNESS HAS NEVER BEEN THIS FUN.</h2>
              <p className="fp-lead">Fit Run is playable now on a laptop or phone. Fit Fight and Fit Dance are coming soon.</p>
            </Reveal>
            <GameLibrary variant="home" />
          </div>
        </section>

        <section className="fp-section" id="experience" aria-labelledby="experience-title">
          <div className="fp-wrap fp-experience">
            <Reveal className="fp-experience-copy">
              <p className="fp-kicker">The experience</p>
              <h2 id="experience-title">This is what movement looks like now.</h2>
              <p className="fp-lead">
                Fit Run is a 3D run in your browser. Choose Laptop, Mobile Only, or Phone+TV mirror. The camera on that device estimates your pose. Frames stay on the device.
              </p>
              <p className="fp-lead">
                Stand so your head through your knees stay in frame, and leave room to jump and squat. Step or lean to change lanes. A jump clears a low barrier. A squat slides under a high one. Jump height is an estimate, not a measurement.
              </p>
              <ul className="fp-moves" aria-label="Supported movement labels">
                {moves.map((move) => (
                  <li key={move}>{move}</li>
                ))}
              </ul>
              <div className="fp-actions">
                <TrackedLink className="fp-btn fp-btn-primary" href="/play" events={[{ name: "play_clicked", params: { surface: "home" } }]}>
                  Play Demo
                </TrackedLink>
              </div>
            </Reveal>
            <Reveal className="fp-experience-visual">
              <figure className="fp-experience-figure">
                <img
                  src="/marketing/your-body-your-controller.png"
                  alt="PlayFit Club: your body is the controller — run, jump, and squat map to in-game moves."
                  width={819}
                  height={545}
                  loading="lazy"
                  decoding="async"
                />
              </figure>
            </Reveal>
          </div>
        </section>

        <section className="fp-section" id="how-it-works" aria-labelledby="how-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">How it works</p>
              <h2 id="how-title">Choose how you play.</h2>
              <p className="fp-lead">
                Fit Run runs in the browser on a laptop or phone. PlayFit Club reads movement for the game. It does not give medical advice.
              </p>
            </Reveal>
            <Reveal className="fp-steps" stagger>
              <article>
                <StepIcon name="setup" />
                <p className="fp-step-no">Step 01</p>
                <h3>Laptop</h3>
                <p>Open Fit Run in the laptop browser. The webcam tracks you and the game plays on that screen.</p>
              </article>
              <article>
                <StepIcon name="move" />
                <p className="fp-step-no">Step 02</p>
                <h3>Mobile Only</h3>
                <p>Open Fit Run on your phone in portrait. The phone camera tracks you and the game plays on the phone.</p>
              </article>
              <article>
                <StepIcon name="play" />
                <p className="fp-step-no">Step 03</p>
                <h3>Phone + TV mirror</h3>
                <p>Play on the phone, then mirror that screen to a TV with Smart View, Cast, Screen Mirroring, or HDMI. There is no separate TV browser game.</p>
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
              <h2 id="benefits-title">More play. More movement. More reasons to come back.</h2>
            </Reveal>
            <Reveal className="fp-benefits" stagger>
              <article>
                <h3>Move to play</h3>
                <p>In Fit Run, a step or lean, a jump, and a squat are how you play.</p>
              </article>
              <article>
                <h3>Make every session a challenge</h3>
                <p>Burn calories by playing at home. Chase the score. Signed-in players can keep a personal best.</p>
              </article>
              <article>
                <h3>Bring the screen to life</h3>
                <p>Fit Run’s world is a procedural city on the device that plays. Mirror the phone when you want that same picture on a TV.</p>
              </article>
              <article>
                <h3>One play device</h3>
                <p>The laptop or phone runs the game and camera. For a bigger picture, mirror the phone with Smart View, Cast, Screen Mirroring, or HDMI.</p>
              </article>
            </Reveal>
          </div>
        </section>

        <section className="fp-section" id="gyms" aria-labelledby="ways-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">Home and gyms</p>
              <h2 id="ways-title">One experience. More ways to play.</h2>
            </Reveal>
            <div className="fp-ways">
              <article className="fp-panel">
                <h3>Turn your space into a playground.</h3>
                <p>Play Fit Run at home on a laptop or phone. The free demo does not need an account.</p>
                <TrackedLink className="fp-btn fp-btn-primary" href="/play" events={[{ name: "play_clicked", params: { surface: "home" } }]}>
                  Play Demo
                </TrackedLink>
              </article>
              <article className="fp-panel">
                <h3>Accounts for members who play at home.</h3>
                <p>A gym buys member accounts. Each member plays Fit Run on their own laptop or phone. Gym Starter covers up to 49 accounts. Gym Pro covers 50 to 99.</p>
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
              <p className="fp-lead">Scores, personal bests, and achievements are real for finished rounds. A public daily challenge is not. Nothing below is invented.</p>
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
                <TrackedLink className="fp-btn fp-btn-primary" href="/play" events={[{ name: "play_clicked", params: { surface: "home" } }]}>
                  Play Demo
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

function StepIcon({ name }: { name: "setup" | "move" | "play" }) {
  if (name === "setup") {
    return (
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <rect x="6" y="8" width="24" height="16" />
        <path d="M14 28h8M18 24v4" />
      </svg>
    );
  }
  if (name === "move") {
    return (
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="8" r="3" />
        <path d="M18 12v8M12 16l6 4 6-4M14 30l4-10 4 10" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 36 36" aria-hidden="true">
      <path d="M10 26l6-16 4 8 6-4" />
      <path d="M8 28h20" />
    </svg>
  );
}
