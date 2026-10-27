export function GameplayPoster({ id = "watch" }: { id?: string }) {
  return (
    <figure className="fp-poster" id={id}>
      <img
        src="/marketing/watch-gameplay.jpg"
        alt="An illustration of Fit Run on a TV with a phone in front, labeled Watch Gameplay."
        width={1024}
        height={576}
        loading="lazy"
        decoding="async"
      />
    </figure>
  );
}
