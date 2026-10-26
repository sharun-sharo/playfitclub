import { TrackedLink } from "@/components/analytics/tracked-link";
import { PHONE_PLAY_PATH } from "@/components/fitrunner-v2/phone-local-play";
import { Reveal } from "@/components/marketing/reveal";

const games = [
  {
    title: "Fit Run",
    description: "A 3D run on your phone. Lean, jump, and squat.",
    status: "Available",
    href: PHONE_PLAY_PATH,
    image: "/marketing/fit-run.jpg",
    alt: "Illustration of a woman running in a living room. A phone shows a body outline and a television shows a running game.",
  },
  {
    title: "Fit Fight",
    description: "Interactive boxing. Coming soon.",
    status: "Coming soon",
    href: null,
    image: "/marketing/fit-fight.jpg",
    alt: "Illustration of a man hitting a heavy bag in a living room, with a television showing a boxing game.",
  },
  {
    title: "Fit Dance",
    description: "Follow-the-instructor dance. Coming soon.",
    status: "Coming soon",
    href: null,
    image: "/marketing/fit-dance.jpg",
    alt: "Illustration of a woman dancing in a living room, with a television showing a dance game.",
  },
] as const;

export function GameLibrary({ heading = "h3" }: { heading?: "h2" | "h3" }) {
  const Title = heading;

  return (
    <Reveal className="fp-library" stagger>
      {games.map((game) => (
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
                <img src={game.image} alt={game.alt} width={960} height={890} />
              </TrackedLink>
            ) : (
              <img src={game.image} alt={game.alt} width={960} height={890} />
            )}
            <span className={game.status === "Coming soon" ? "fp-library-soon" : undefined}>{game.status}</span>
          </div>
          <div className="fp-library-copy">
            <Title>{game.title}</Title>
            <p>{game.description}</p>
            {game.href ? (
              <TrackedLink
                className="fp-btn fp-btn-primary"
                href={game.href}
                events={[
                  { name: "play_clicked", params: { surface: "library" } },
                  { name: "fit_run_selected", params: { surface: "library" } },
                ]}
              >
                Play Demo
              </TrackedLink>
            ) : (
              <button className="fp-btn fp-btn-ghost" type="button" disabled>
                Coming soon
              </button>
            )}
          </div>
        </article>
      ))}
    </Reveal>
  );
}
