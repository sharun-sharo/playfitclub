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
  { title: "The phone plays Fit Run.", copy: "The front camera tracks your body. There is no console and no extra sensor." },
  { title: "Every move matters.", copy: "A lean changes lanes. A jump clears a low barrier. A squat slides under a high one." },
  { title: "Landscape on your phone.", copy: "Turn the phone sideways and stand in frame. A TV or laptop shows the game only if you mirror that phone." },
];

const moves = ["Run", "Jump", "Dodge", "Move"];

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
              <h2 id="games-title">Pick your world. Make your move.</h2>
              <p className="fp-lead">Fit Run is playable now on your phone. Fit Fight and Fit Dance are coming soon.</p>
            </Reveal>
            <GameLibrary />
          </div>
        </section>

        <section className="fp-section" id="experience" aria-labelledby="experience-title">
          <div className="fp-wrap fp-experience">
            <Reveal>
              <p className="fp-kicker">The experience</p>
              <h2 id="experience-title">This is what movement looks like now.</h2>
              <p className="fp-lead">
                Fit Run is a 3D run on your phone. The front camera estimates your pose in the browser. Frames stay on the phone.
              </p>
              <p className="fp-lead">
                Turn sideways, stand so your head through your knees stay in frame, and leave room to jump and squat. A lean changes lanes. A jump clears a low barrier. A squat slides under a high one. Jump height is an estimate, not a measurement.
              </p>
              <ul className="fp-moves" aria-label="Supported movement labels">
                {moves.map((move) => (
                  <li key={move}>{move}</li>
                ))}
              </ul>
              <div className="fp-actions">
                <TrackedLink className="fp-btn fp-btn-primary" href="/play/phone" events={[{ name: "play_clicked", params: { surface: "home" } }]}>
                  Play Demo
                </TrackedLink>
              </div>
            </Reveal>
            <Reveal delay={1}>
              <figure className="fp-still">
                <img
                  src="/marketing/fit-run.jpg"
                  alt="Illustration of a woman running in a living room. A phone shows a body outline and a television shows a running game."
                  width={960}
                  height={890}
                />
                <figcaption>Illustration of Fit Run at home. The game runs on the phone.</figcaption>
              </figure>
            </Reveal>
          </div>
        </section>

        <section className="fp-section" id="how-it-works" aria-labelledby="how-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">How it works</p>
              <h2 id="how-title">Open it on your phone.</h2>
              <p className="fp-lead">
                Use a phone with a front camera. PlayFit Club reads movement for the game. It does not give medical advice.
              </p>
            </Reveal>
            <Reveal className="fp-steps" stagger>
              <article>
                <StepIcon name="setup" />
                <p className="fp-step-no">Step 01</p>
                <h3>Open</h3>
                <p>Open PlayFit Club on your phone and tap Play Demo.</p>
              </article>
              <article>
                <StepIcon name="move" />
                <p className="fp-step-no">Step 02</p>
                <h3>Frame</h3>
                <p>Allow the camera, turn the phone sideways, and stand so your body is in frame from head through knees. Use good light and leave space to jump and squat.</p>
              </article>
              <article>
                <StepIcon name="play" />
                <p className="fp-step-no">Step 03</p>
                <h3>Play</h3>
                <p>Wait for the countdown, then play. To put the same picture on a TV or laptop, mirror the phone with Smart View, Cast, Screen Mirroring, or HDMI.</p>
              </article>
            </Reveal>
            <div className="fp-help">
              <article>
                <h3>What you need</h3>
                <ul>
                  <li>A phone with a front camera, in the phone browser or the installed page.</li>
                  <li>Landscape, with your full body in frame from head through knees.</li>
                  <li>Good light, and space to jump and squat.</li>
                </ul>
              </article>
              <article>
                <h3>If the camera misses you</h3>
                <ul>
                  <li>Allow the camera when the browser asks.</li>
                  <li>Use the phone browser or the installed page.</li>
                  <li>Turn the phone sideways.</li>
                  <li>Step back until your body fits.</li>
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
                <p>In Fit Run, a lean, a jump, and a squat are how you play.</p>
              </article>
              <article>
                <h3>Make every session a challenge</h3>
                <p>Burn calories by playing at home. Chase the score. Signed-in players can keep a personal best.</p>
              </article>
              <article>
                <h3>Bring the screen to life</h3>
                <p>Fit Run’s world is a procedural city on your phone. Mirror that phone when you want it on a TV.</p>
              </article>
              <article>
                <h3>One phone</h3>
                <p>The phone runs the game. Smart View, Cast, Screen Mirroring, or HDMI can show that screen on a TV or laptop.</p>
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
                <p>Play Fit Run at home on your phone. The free demo does not need an account.</p>
                <TrackedLink className="fp-btn fp-btn-primary" href="/play/phone" events={[{ name: "play_clicked", params: { surface: "home" } }]}>
                  Play Demo
                </TrackedLink>
              </article>
              <article className="fp-panel">
                <h3>Accounts for members who play at home.</h3>
                <p>A gym buys member accounts. Each member plays Fit Run on their own phone. Gym Starter covers up to 49 accounts. Gym Pro covers 50 to 99.</p>
                <Link className="fp-btn fp-btn-ghost" href="/gyms">
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
              <p className="fp-lead">Open Fit Run on your phone. Move with purpose. Make every session an experience.</p>
              <div className="fp-actions">
                <TrackedLink className="fp-btn fp-btn-primary" href="/play/phone" events={[{ name: "play_clicked", params: { surface: "home" } }]}>
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
