import Link from "next/link";

export function BrandLogo({ href = "/", variant = "default" }: { href?: string; variant?: "default" | "footer" }) {
  const src = variant === "footer" ? "/marketing/playfit-club-logo-footer.png" : "/marketing/playfit-club-logo.png";
  return (
    <Link href={href} className="fp-logo" aria-label="PlayFit Club home">
      <img src={src} alt="PlayFit Club" width={851} height={178} />
    </Link>
  );
}
