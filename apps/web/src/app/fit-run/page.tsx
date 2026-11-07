import type { Metadata } from "next";
import Link from "next/link";
import { SeoLanding, SeoRequirements } from "@/components/marketing/seo-landing";
import { fitRunMetadata, fitRunSoftwareJsonLd } from "@/lib/site-metadata";

export const metadata: Metadata = fitRunMetadata;

const faqs = [
  {
    q: "What is Fit Run?",
    a: "Fit Run is PlayFit Club’s playable 3D online running game. You play in the browser on a laptop or phone. Your camera tracks movement so steps, jumps, and squats control the runner.",
  },
  {
    q: "Is Fit Run a downloadable game?",
    a: "No. Fit Run runs in the browser. There is no separate game installer. Open Play Demo, choose how you play, and allow the camera.",
  },
  {
    q: "What devices work with Fit Run?",
    a: "A laptop webcam or a phone front camera in a supported browser. Laptop play uses that webcam. Mobile Only plays on the phone. Phone + TV mirror keeps gameplay on the phone and copies the screen to a TV.",
  },
  {
    q: "Are there other games besides Fit Run?",
    a: "Fit Run is the game you can play today. Fit Fight and Fit Dance are coming soon and cannot be started yet.",
  },
];

export default function FitRunLandingPage() {
  return (
    <SeoLanding
      kicker="Fit Run"
      title="A 3D online running game you control with your body."
      lead="Fit Run is PlayFit Club’s motion-controlled runner. Play in your browser with a laptop webcam or phone camera—no console and no game download."
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Fit Run", path: "/fit-run" },
      ]}
      image={{
        src: "/marketing/fit-run.jpg",
        alt: "Illustration of a woman running in a living room while Fit Run shows on a phone and TV.",
        width: 960,
        height: 890,
      }}
      faqs={faqs}
      related={[
        { href: "/online-running-games", label: "Online running games" },
        { href: "/browser-games", label: "Browser games without download" },
        { href: "/webcam-games", label: "Webcam & camera-controlled games" },
        { href: "/games", label: "All experiences" },
      ]}
      jsonLd={fitRunSoftwareJsonLd}
    >
      <section className="fp-section" aria-labelledby="fit-run-play-title">
        <div className="fp-wrap">
          <p className="fp-kicker">Gameplay</p>
          <h2 id="fit-run-play-title">An endless-style 3D run with real movement.</h2>
          <p className="fp-lead">
            Fit Run puts you on a three-lane path through a procedural city. Obstacles appear ahead. You do not tap arrows or press a jump button—the camera on your play device estimates your pose and maps it to lane changes, jumps, and squats.
          </p>
          <p className="fp-lead">
            Jump height is an estimate for gameplay, not a measurement, and PlayFit Club does not give medical advice. Scores and personal bests apply to finished rounds for signed-in players.
          </p>
          <figure className="fp-seo-figure fp-seo-figure-secondary">
            <img
              src="/marketing/watch-gameplay.jpg"
              alt="Fit Run gameplay poster showing the runner on screen with a phone in front."
              width={1024}
              height={576}
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      <section className="fp-section" aria-labelledby="fit-run-modes-title">
        <div className="fp-wrap">
          <h2 id="fit-run-modes-title">Three ways to play Fit Run</h2>
          <div className="fp-statements">
            <article>
              <h3>Laptop</h3>
              <p>Open Fit Run in the laptop browser. The webcam tracks you while the game plays on that screen.</p>
            </article>
            <article>
              <h3>Mobile Only</h3>
              <p>Open Fit Run on your phone in portrait. The phone camera tracks you and the game stays on the phone.</p>
            </article>
            <article>
              <h3>Phone + TV mirror</h3>
              <p>Play on the phone, then mirror that screen with Smart View, Cast, Screen Mirroring, or HDMI. There is no separate TV browser game.</p>
            </article>
          </div>
          <SeoRequirements />
          <p className="fp-lead">
            Ready to try it? Start from{" "}
            <Link href="/play">Play Demo</Link>, or read more about{" "}
            <Link href="/online-running-games">online running games</Link> and{" "}
            <Link href="/webcam-games">webcam games</Link>.
          </p>
        </div>
      </section>
    </SeoLanding>
  );
}
