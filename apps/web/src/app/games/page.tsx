import type { Metadata } from "next";
import { GameLibrary } from "@/components/marketing/game-library";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { gamesMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = gamesMetadata;

export default function GamesPage() {
  return (
    <MarketingFrame classic>
      <SiteNav prefix="/" logo="footer" />
      <main className="fp-wrap fp-page">
        <p className="fp-kicker">Experience</p>
        <h1>Pick a game.</h1>
        <p className="fp-lead">
          Fit Run plays on your phone or laptop. Tap Play Demo, choose how you play, allow the camera, and stand in frame. Fit Fight and Fit Dance are coming soon and cannot be started.
        </p>
        <GameLibrary heading="h2" />
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
