import type { Metadata } from "next";
import { fpDisplay, fpSans } from "@/components/marketing/fonts";
import { TvHome } from "./tv-home";

export const metadata: Metadata = {
  title: "PlayFit Club",
  description: "Play Fit Run on this screen. The phone is the controller.",
  robots: { index: false, follow: false },
};

export default function TvHomePage() {
  return (
    <div className={`${fpDisplay.variable} ${fpSans.variable}`}>
      <link rel="preload" as="image" href="/marketing/hero-run.jpg" type="image/jpeg" />
      <TvHome />
    </div>
  );
}
