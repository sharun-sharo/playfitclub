import type { Metadata } from "next";
import Link from "next/link";
import { SeoLanding, SeoRequirements } from "@/components/marketing/seo-landing";
import { browserGamesMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = browserGamesMetadata;

const faqs = [
  {
    q: "Can I play without downloading a game?",
    a: "Yes. Fit Run is a free browser game path on PlayFit Club. Open the site, choose Play Demo, and play in a modern browser on a laptop or phone. There is no separate game installer.",
  },
  {
    q: "Is this a large library of free online games?",
    a: "No. PlayFit Club currently offers Fit Run. This page explains browser play for that game. Fit Fight and Fit Dance are coming soon.",
  },
  {
    q: "Can I play browser games on a laptop?",
    a: "Yes. Laptop mode uses the laptop webcam and shows Fit Run on that screen. Mobile Only uses the phone. For a bigger picture, mirror the phone to a TV.",
  },
  {
    q: "Does browser play need an account?",
    a: "The free demo does not need an account. When demo active time is used, Buy Plan opens Pricing. Signing in is for personal bests and paid plans activated by the team.",
  },
];

export default function BrowserGamesPage() {
  return (
    <SeoLanding
      kicker="Browser games"
      title="Games to play online without downloading."
      lead="PlayFit Club runs Fit Run in your browser—an interactive online game on laptop or phone. No game download; allow the camera and move to play."
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Browser games", path: "/browser-games" },
      ]}
      image={{
        src: "/marketing/hero-laptop-jump.jpg",
        alt: "Player jumping in a living room while Fit Run shows on a laptop browser.",
        width: 1024,
        height: 682,
      }}
      faqs={faqs}
      related={[
        { href: "/fit-run", label: "Fit Run" },
        { href: "/online-running-games", label: "Online running games" },
        { href: "/webcam-games", label: "Webcam games" },
        { href: "/pricing", label: "Pricing & free demo" },
      ]}
    >
      <section className="fp-section" aria-labelledby="browser-why-title">
        <div className="fp-wrap">
          <p className="fp-kicker">Play online</p>
          <h2 id="browser-why-title">A free browser game path with a clear twist.</h2>
          <p className="fp-lead">
            If you want games to play online on a laptop or phone without hunting for installers, Fit Run opens in the page you already have. The unique part is motion: the camera on that device estimates your pose so your body is the controller.
          </p>
          <div className="fp-statements">
            <article>
              <h3>No game download</h3>
              <p>Start from Play Demo. The experience loads in the browser. Store apps for iOS and Android are coming soon; until then, browser play is the path.</p>
            </article>
            <article>
              <h3>Laptop or phone</h3>
              <p>Choose Laptop for webcam play on the computer screen, or Mobile Only for portrait play on your phone.</p>
            </article>
            <article>
              <h3>One honest title today</h3>
              <p>We market Fit Run as the playable game. Coming-soon titles stay disabled so search pages do not invent a catalog.</p>
            </article>
          </div>
          <figure className="fp-seo-figure fp-seo-figure-secondary">
            <img
              src="/marketing/play-on-laptop.jpg"
              alt="Play on laptop option showing Fit Run ready in a browser window."
              width={1024}
              height={576}
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      <section className="fp-section" aria-labelledby="browser-how-title">
        <div className="fp-wrap">
          <h2 id="browser-how-title">How browser play works</h2>
          <ol className="fp-ordered">
            <li>Visit PlayFit Club and tap Play Demo.</li>
            <li>Pick Laptop, Mobile Only, or Phone + TV mirror.</li>
            <li>Grant camera access for that device.</li>
            <li>Move in frame—step or lean, jump, squat—to control Fit Run.</li>
          </ol>
          <SeoRequirements />
          <p className="fp-lead">
            Prefer motion-first discovery? See <Link href="/webcam-games">webcam games online</Link>. For the runner itself, open{" "}
            <Link href="/fit-run">Fit Run</Link>.
          </p>
        </div>
      </section>
    </SeoLanding>
  );
}
