import { fpDisplay, fpSans } from "@/components/marketing/fonts";
import { tvHomeMetadata } from "@/lib/site-metadata";
import { TvHome } from "./tv-home";

export const metadata = tvHomeMetadata;

export default function TvHomePage() {
  return (
    <div className={`${fpDisplay.variable} ${fpSans.variable}`}>
      <link rel="preload" as="image" href="/marketing/hero-run.jpg" type="image/jpeg" />
      <TvHome />
    </div>
  );
}
