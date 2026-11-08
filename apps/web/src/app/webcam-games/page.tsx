import type { Metadata } from "next";
import Link from "next/link";
import { SeoLanding, SeoRequirements } from "@/components/marketing/seo-landing";
import { webcamGamesMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = webcamGamesMetadata;

const faqs = [
  {
    q: "What are webcam games on PlayFit Club?",
    a: "Fit Run uses your laptop webcam or phone camera to estimate pose in the browser. Your movement controls the runner. Video frames stay on the device and are not uploaded for analytics.",
  },
  {
    q: "Do I need a special motion controller?",
    a: "No. There is no console accessory and no wearable required for Fit Run. A standard webcam or front camera is enough when lighting and framing are good.",
  },
  {
    q: "Is this a fitness-only product?",
    a: "Fit Run is both an interactive online game and a movement session. You can discover it as a webcam game or as a running game; the same Fit Run demo applies.",
  },
  {
    q: "What if the camera misses my moves?",
    a: "Allow camera permission, step back until head through knees fit, improve front lighting, and leave room to jump and squat. The game estimates pose—it does not measure jump height for medical use.",
  },
];

export default function WebcamGamesPage() {
  return (
    <SeoLanding
      kicker="Webcam games"
      title="Webcam games online controlled by your body."
      lead="Camera-controlled games on PlayFit Club start with Fit Run. Use a laptop webcam or phone camera so jumps, squats, and lane moves drive a 3D browser runner."
      crumbs={[
        { name: "Home", path: "/" },
        { name: "Webcam games", path: "/webcam-games" },
      ]}
      image={{
        src: "/marketing/your-body-your-controller.png",
        alt: "PlayFit Club motion detection: a squat with neon skeleton tracking mirrored by the game avatar — Your Moves in the Game.",
        width: 819,
        height: 545,
      }}
      faqs={faqs}
      related={[
        { href: "/fit-run", label: "Fit Run" },
        { href: "/online-running-games", label: "Online running games" },
        { href: "/browser-games", label: "Browser games" },
        { href: "/#how-it-works", label: "How it works" },
      ]}
    >
      <section className="fp-section" aria-labelledby="webcam-why-title">
        <div className="fp-wrap">
          <p className="fp-kicker">Motion controls</p>
          <h2 id="webcam-why-title">Body movement games without extra hardware.</h2>
          <p className="fp-lead">
            Webcam games online usually mean the camera watches you. On PlayFit Club, that feed stays local while the browser estimates pose for Fit Run. You get camera-controlled play and motion-controlled running in one title—not a directory of unrelated webcam toys.
          </p>
          <div className="fp-statements">
            <article>
              <h3>Laptop webcam</h3>
              <p>Stand in front of the laptop, allow the camera, and play Fit Run on that screen.</p>
            </article>
            <article>
              <h3>Phone camera</h3>
              <p>Mobile Only uses the front camera in portrait. Mirror the phone if you want the same picture on a TV.</p>
            </article>
            <article>
              <h3>Privacy-minded tracking</h3>
              <p>Pose runs on the device. Analytics measures page views and button clicks—not camera frames or landmark coordinates.</p>
            </article>
          </div>
          <figure className="fp-seo-figure fp-seo-figure-secondary">
            <img
              src="/marketing/hero-jump-leap.jpg"
              alt="Player performing a jump while a laptop shows the motion-controlled game."
              width={1024}
              height={682}
              loading="lazy"
              decoding="async"
            />
          </figure>
        </div>
      </section>

      <section className="fp-section" aria-labelledby="webcam-how-title">
        <div className="fp-wrap">
          <h2 id="webcam-how-title">Camera requirements for Fit Run</h2>
          <SeoRequirements />
          <p className="fp-lead">
            Continue to <Link href="/fit-run">Fit Run</Link> for gameplay detail, or{" "}
            <Link href="/browser-games">browser games</Link> if you care most about playing without a download.
          </p>
        </div>
      </section>
    </SeoLanding>
  );
}
