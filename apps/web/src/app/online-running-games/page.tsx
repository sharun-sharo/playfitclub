import type { Metadata } from "next";
import Link from "next/link";
import { SeoLanding, SeoRequirements } from "@/components/marketing/seo-landing";
import { onlineRunningGamesMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = onlineRunningGamesMetadata;

const faqs = [
  {
    q: "Where can I play an online running game right now?",
    a: "On PlayFit Club, Fit Run is the playable online running game. Open Play Demo in your browser on a laptop or phone, allow the camera, and move to control the runner.",
  },
  {
    q: "Is Fit Run an endless runner?",
    a: "Fit Run is a 3D endless-style runner: you keep going until you run out of lives or end the round. Lanes, jumps, and squats are driven by your body, not keyboard arrows.",
  },
  {
    q: "Do I need to download a running game?",
    a: "No. Fit Run is a browser game. There is no separate game download. A free demo covers limited active camera time; paid plans are listed on Pricing.",
  },
  {
    q: "Does PlayFit Club offer many running games?",
    a: "Today PlayFit Club offers Fit Run. Other experiences such as Fit Fight and Fit Dance are coming soon and are not playable yet.",
  },
];

export default function OnlineRunningGamesPage() {
  return (
    <SeoLanding
      kicker="Online running games"
      title="Running games online you play with your body."
      lead="Searching for running games online or an online running game that feels different? Fit Run is a 3D browser runner controlled by camera-based motion—not a catalog of dozens of titles."
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Online running games", path: "/online-running-games" },
      ]}
      image={{
        src: "/marketing/hero-run-adventure.jpg",
        alt: "Person running in a living room while an online running game plays on the TV.",
        width: 1024,
        height: 682,
      }}
      faqs={faqs}
      related={[
        { href: "/fit-run", label: "Fit Run overview" },
        { href: "/browser-games", label: "Browser games" },
        { href: "/webcam-games", label: "Webcam games" },
        { href: "/games", label: "Experiences" },
      ]}
    >
      <section className="fp-section" aria-labelledby="running-why-title">
        <div className="fp-wrap">
          <p className="fp-kicker">Why Fit Run</p>
          <h2 id="running-why-title">An online running game built for movement.</h2>
          <p className="fp-lead">
            Most endless runner games ask you to swipe or tap. Fit Run turns lane changes, jumps, and slides into real steps, jumps, and squats tracked by your laptop webcam or phone camera. You still play online in the browser—the difference is how you control the character.
          </p>
          <div className="fp-statements">
            <article>
              <h3>3D running in the browser</h3>
              <p>Fit Run renders a procedural city run on the device that plays. Open the page and start—no store install for the game itself.</p>
            </article>
            <article>
              <h3>Endless-style challenge</h3>
              <p>Dodge obstacles, chase distance and score, and come back for a better run. Signed-in players can keep a personal best.</p>
            </article>
            <article>
              <h3>Honest catalog</h3>
              <p>PlayFit Club currently offers Fit Run. We do not list fake titles. Fit Fight and Fit Dance are marked coming soon.</p>
            </article>
          </div>
          <figure className="fp-seo-figure fp-seo-figure-secondary">
            <img
              src="/marketing/fit-run-coast-key-art.jpg"
              alt="Fit Run key art with a coastal 3D running path."
              width={1024}
              height={576}
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      <section className="fp-section" aria-labelledby="running-how-title">
        <div className="fp-wrap">
          <h2 id="running-how-title">How to start an online running game session</h2>
          <ol className="fp-ordered">
            <li>Open Play Demo and choose Laptop, Mobile Only, or Phone + TV mirror.</li>
            <li>Allow the camera when the browser prompts you.</li>
            <li>Stand so your head through your knees stay in frame.</li>
            <li>After the countdown, step or lean, jump, and squat to play.</li>
          </ol>
          <SeoRequirements />
          <p className="fp-lead">
            Learn more about <Link href="/fit-run">Fit Run</Link>, or see how it fits{" "}
            <Link href="/browser-games">browser games without download</Link>.
          </p>
        </div>
      </section>
    </SeoLanding>
  );
}
