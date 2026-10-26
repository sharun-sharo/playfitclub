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
          Fit Run plays on your phone. Open https://playfitclub.com/play/phone, then mirror that phone screen to a TV or laptop. Fit Fight and Fit Dance are coming soon.
        </p>
        <GameLibrary heading="h2" />
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}
