import Image from "next/image";

export function HeroPicture({
  jpeg,
  alt,
  priority = false,
}: {
  jpeg: string;
  png?: string;
  alt: string;
  priority?: boolean;
}) {
  return (
    <Image
      className="fp-hero-media"
      src={jpeg}
      alt={alt}
      width={1024}
      height={682}
      sizes="(max-width: 799px) 100vw, (max-width: 1099px) 58vw, 56vw"
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      draggable={false}
    />
  );
}
