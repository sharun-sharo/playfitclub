import type { Metadata } from "next";
import { GameLibrary } from "@/components/marketing/game-library";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export const metadata: Metadata = {
  title: "Games — PlayFit Club",
  description: "Fit Run is the motion-controlled running adventure you can play now. Fit Fight and Fit Dance are coming soon.",
};

export default function GamesPage() {
  return (
    <MarketingFrame>
      <SiteNav prefix="/" />
      <main className="fp-wrap fp-page">
        <p className="fp-kicker">Experience</p>
        <h1>Pick a game.</h1>
        <p className="fp-lead">
          Fit Run is available. Play opens the existing lobby on a television or laptop, with a phone camera as the controller. Fit Fight and Fit Dance are coming soon and do not launch.
        </p>
        <GameLibrary heading="h2" />
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
