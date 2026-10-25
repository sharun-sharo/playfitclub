import type { Metadata } from "next";
import { GameLibrary } from "@/components/marketing/game-library";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { gamesMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = gamesMetadata;

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
