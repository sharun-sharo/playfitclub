import { TrackedLink } from "@/components/analytics/tracked-link";
import { PHONE_PLAY_PATH } from "@/components/fitrunner-v2/phone-local-play";
import { Reveal } from "@/components/marketing/reveal";

const games = [
  {
    title: "Fit Run",
    description: "Motion-controlled running adventure",
    status: "Available",
    href: PHONE_PLAY_PATH,
    image: "/marketing/fit-run.jpg",
    alt: "A woman runs in a living room toward a television showing a motion-controlled running game, with a phone tracking her pose.",
  },
  {
    title: "Fit Fight",
    description: "Interactive boxing",
    status: "Coming soon",
    href: null,
    image: "/marketing/fit-fight.jpg",
    alt: "A man punches a heavy bag in front of a television showing an interactive boxing game, with a phone tracking his pose.",
  },
  {
    title: "Fit Dance",
    description: "Follow-the-instructor dance fitness",
    status: "Coming soon",
    href: null,
    image: "/marketing/fit-dance.jpg",
    alt: "A woman dances in a living room toward a television showing a follow-the-instructor dance game, with a phone tracking her pose.",
  },
] as const;

export function GameLibrary({
  heading = "h3",
  showPhoneLink = true,
}: {
  heading?: "h2" | "h3";
  showPhoneLink?: boolean;
}) {
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
                Play Game
              </TrackedLink>
            ) : null}
            {game.href && showPhoneLink ? (
              <p>
                <a className="fp-text-link" href={PHONE_PLAY_PATH}>
                  Play on your phone
                </a>
              </p>
            ) : game.href ? null : (
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
