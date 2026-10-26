import { TrackedLink } from "@/components/analytics/tracked-link";
import { PHONE_PLAY_PATH } from "@/components/fitrunner-v2/phone-local-play";
import { Reveal } from "@/components/marketing/reveal";

const games = [
  {
    title: "Fit Run",
    description: "Run, jump, squat, and dodge obstacles using your real body movements.",
    status: "Available",
    href: PHONE_PLAY_PATH,
    image: "/marketing/fit-run.jpg",
    alt: "Illustration of a woman running in a living room. A phone shows a body outline and a television shows a running game.",
    action: "Play Fit Run",
  },
  {
    title: "Fit Fight",
    description: "Interactive boxing. Coming soon.",
    status: "Coming soon",
    href: null,
    image: "/marketing/fit-fight.jpg",
    alt: "Illustration of a man hitting a heavy bag in a living room, with a television showing a boxing game.",
    action: "Coming soon",
  },
  {
    title: "Fit Dance",
    description: "Follow-the-instructor dance. Coming soon.",
    status: "Coming soon",
    href: null,
    image: "/marketing/fit-dance.jpg",
    alt: "Illustration of a woman dancing in a living room, with a television showing a dance game.",
    action: "Coming soon",
  },
] as const;

export function GameLibrary({ heading = "h3", variant = "site" }: { heading?: "h2" | "h3"; variant?: "home" | "site" }) {
  const Title = heading;

  return (
    <Reveal className="fp-library" stagger>
      {games.map((game) => {
        const description = variant === "home" && game.title === "Fit Run" ? "A 3D run on your phone. Lean, jump, and squat." : game.description;
        const action = variant === "home" && game.href ? "Play Demo" : game.action;
        return (
          <article key={game.title} className="fp-library-card">
            <div className="fp-library-visual">
              {game.href ? (
                <TrackedLink
                  href={game.href}
                  events={[
                    { name: "play_clicked", params: { surface: "library" } },
                    { name: "fit_run_selected", params: { surface: "library" } },
                  ]}
                >
                  <img src={game.image} alt={game.alt} width={960} height={890} loading="lazy" decoding="async" />
                </TrackedLink>
              ) : (
                <img src={game.image} alt={game.alt} width={960} height={890} loading="lazy" decoding="async" />
              )}
              <span className={game.status === "Coming soon" ? "fp-library-soon" : undefined}>{game.status}</span>
            </div>
            <div className="fp-library-copy">
              <Title>{game.title}</Title>
              <p>{description}</p>
              {game.href ? (
                <TrackedLink
                  className="fp-btn fp-btn-primary"
                  href={game.href}
                  events={[
                    { name: "play_clicked", params: { surface: "library" } },
                    { name: "fit_run_selected", params: { surface: "library" } },
                  ]}
                >
                  {action}
                </TrackedLink>
              ) : (
                <button className="fp-btn fp-btn-ghost" type="button" disabled>
                  Coming soon
                </button>
              )}
            </div>
          </article>
        );
      })}
    </Reveal>
  );
}
