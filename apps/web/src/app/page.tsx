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

export const metadata: Metadata = {
  title: "PlayFit Club — Move Your Body. Play Your World.",
  description:
    "Play Fit Run at home on a TV or laptop with a phone camera. Gyms buy member seats so people can play that same game at home.",
  openGraph: {
    title: "PlayFit Club — Move Your Body. Play Your World.",
    description:
      "A movement-driven arcade in the browser. One phone is the controller. The TV or laptop is the screen.",
    type: "website",
  },
};

const statements = [
  { title: "Your body. Your controls.", copy: "The phone camera is the controller. No console and no extra sensor." },
  { title: "Every move matters.", copy: "A lean changes lanes. A jump clears a low barrier. A squat slides under a high one." },
  { title: "Play your way.", copy: "One phone is the controller. The TV or laptop is the screen." },
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
              <p className="fp-lead">Forget staring at a timer. Step into a game where your movements drive the action and every session becomes a challenge.</p>
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
              <p className="fp-lead">Fit Run is available now. Fit Fight and Fit Dance are coming soon.</p>
              <div className="fp-actions">
                <Link className="fp-btn fp-btn-ghost" href="/games">
                  See the experience
                </Link>
              </div>
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
                Turn your body into the controller. Run, jump, dodge, and move through immersive 3D worlds using real-world body movements.
              </p>
              <p className="fp-lead">
                A phone camera estimates your pose in the browser. Frames are not uploaded. Stand far enough back that your shoulders, hips, knees, and ankles stay in view, with enough light to see your whole body. Fit Run reads lean, jump, and squat. Jump height is an estimate, not a measurement.
              </p>
              <ul className="fp-moves" aria-label="Supported movement labels">
                {moves.map((move) => (
                  <li key={move}>{move}</li>
                ))}
              </ul>
              <div className="fp-actions">
                <Link className="fp-btn fp-btn-primary" href="/play">
                  Experience PlayFit Club
                </Link>
              </div>
            </Reveal>
            <Reveal delay={1}>
              {/*
                Future gameplay video:
                Replace this labelled slot with a real FitPlay recording.
                Do not point it at an unrelated clip.
                <video controls preload="none" playsInline>
                  <source src="/media/fitplay-experience.mp4" type="video/mp4" />
                </video>
              */}
              <div className="fp-media">
                <div className="fp-media-slot">
                  <div>
                    <strong>Footage slot</strong>
                    <p>No gameplay video is published yet. This frame is a concrete texture, not a live match. Drop a real recording into the comment in this file when one exists.</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="fp-section" id="how-it-works" aria-labelledby="how-title">
          <div className="fp-wrap">
            <Reveal>
              <p className="fp-kicker">How it works</p>
              <h2 id="how-title">No controller. Just movement.</h2>
              <p className="fp-lead">
                Camera compatibility, lighting, where you place the phone, and which movements the game supports all change the session. PlayFit Club does not judge exercise form and it cannot prevent injury.
              </p>
            </Reveal>
            <Reveal className="fp-steps" stagger>
              <article>
                <StepIcon name="setup" />
                <p className="fp-step-no">Step 01</p>
                <h3>Set up</h3>
                <p>
                  Open /play on a television or laptop. A join code and QR code appear. On the phone, join that session and place the camera so your full body fits. A phone away from the computer needs an HTTPS page before the camera will start.
                </p>
              </article>
              <article>
                <StepIcon name="move" />
                <p className="fp-step-no">Step 02</p>
                <h3>Move</h3>
                <p>
                  The phone tracks pose locally and sends movement events, not video. Fit Run uses lean left, lean right, jump, and squat. Punch and hold can be detected, and they do not score in this game. Return toward a neutral stance between leans and squats.
                </p>
              </article>
              <article>
                <StepIcon name="play" />
                <p className="fp-step-no">Step 03</p>
                <h3>Play</h3>
                <p>
                  A round runs for about three minutes and ends after three hits. Coins and clean dodges build the score. If the camera is unavailable, the keyboard on that screen is the fallback, not another player.
                </p>
              </article>
            </Reveal>
            <div className="fp-actions">
              <Link className="fp-btn fp-btn-ghost" href="/games">
                See the experience
              </Link>
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
                <p>Use body movements to interact with supported game mechanics. In Fit Run that means lean, jump, and squat.</p>
              </article>
              <article>
                <h3>Make every session a challenge</h3>
                <p>Chase the score on the screen. Signed-in players can keep a personal best. PlayFit Club does not claim calories, heart rate, or exercise quality.</p>
              </article>
              <article>
                <h3>Bring the screen to life</h3>
                <p>Play on a compatible television or laptop browser, with the phone joined to that screen. The world today is Fit Run’s procedural city.</p>
              </article>
              <article>
                <h3>One phone, one screen</h3>
                <p>One phone is the controller. The TV or laptop is the screen. The keyboard on that screen is a fallback, not another player.</p>
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
                <p>Bring movement-driven gaming into your home and make play a more active experience. Home play does not need an account.</p>
                <TrackedLink className="fp-btn fp-btn-primary" href="/play" events={[{ name: "play_clicked", params: { surface: "home" } }]}>
                  Start Playing
                </TrackedLink>
              </article>
              <article className="fp-panel">
                <h3>Seats for members who play at home.</h3>
                <p>A gym buys member seats. Members play Fit Run at home. A full seat signup is not live yet.</p>
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
              <p className="fp-lead">Step into the game. Move with purpose. Make every session an experience.</p>
              <div className="fp-actions">
                <TrackedLink className="fp-btn fp-btn-primary" href="/play" events={[{ name: "play_clicked", params: { surface: "home" } }]}>
                  Play PlayFit Club
                </TrackedLink>
                <Link className="fp-btn fp-btn-ghost" href="/gyms">
                  For gyms
                </Link>
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
