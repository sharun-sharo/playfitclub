import Link from "next/link";

const games = [
  {
    title: "Fit Run",
    description: "Motion-controlled running adventure",
    status: "Available",
    href: "/play",
    image: "/marketing/fit-run.jpg",
    alt: "An athletic adult runs toward the camera on a sunny tropical beach path lined with palm trees.",
  },
  {
    title: "Fit Fight",
    description: "Interactive boxing",
    status: "Coming soon",
    href: null,
    image: "/marketing/fit-fight.jpg",
    alt: "An athletic adult practices a punch on a heavy bag during a boxing workout in a gym.",
  },
  {
    title: "Fit Dance",
    description: "Follow-the-instructor dance fitness",
    status: "Coming soon",
    href: null,
    image: "/marketing/fit-dance.jpg",
    alt: "An athletic adult dances in a bright studio with large windows during a dance workout.",
  },
] as const;

export function GameLibrary({ heading = "h3" }: { heading?: "h2" | "h3" }) {
  const Title = heading;

  return (
    <div className="fp-library">
      {games.map((game) => (
        <article key={game.title} className="fp-library-card">
          <div className="fp-library-visual">
            <img src={game.image} alt={game.alt} width={1280} height={720} />
            <span className={game.status === "Coming soon" ? "fp-library-soon" : undefined}>{game.status}</span>
          </div>
          <div className="fp-library-copy">
            <Title>{game.title}</Title>
            <p>{game.description}</p>
            {game.href ? (
              <Link className="fp-btn fp-btn-primary" href={game.href}>
                Play
              </Link>
            ) : (
              <button className="fp-btn fp-btn-ghost" type="button" disabled>
                Coming soon
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
