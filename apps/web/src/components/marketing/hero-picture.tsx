export function HeroPicture({
  jpeg,
  png,
  alt,
  priority = false,
}: {
  jpeg: string;
  png: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <picture>
      <source srcSet={jpeg} type="image/jpeg" />
      <img
        src={png}
        alt={alt}
        width={864}
        height={1152}
        loading="eager"
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
      />
    </picture>
  );
}
