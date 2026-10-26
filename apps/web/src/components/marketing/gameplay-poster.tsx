export function GameplayPoster({ id = "watch" }: { id?: string }) {
  return (
    <figure className="fp-poster" id={id}>
      <img
        src="/marketing/fit-run.jpg"
        alt="Illustration of a woman running in a living room. A phone shows a body outline and a television shows a running game."
        width={960}
        height={890}
        loading="lazy"
        decoding="async"
      />
      <figcaption>Fit Run at home. The game runs on the phone.</figcaption>
    </figure>
  );
}
