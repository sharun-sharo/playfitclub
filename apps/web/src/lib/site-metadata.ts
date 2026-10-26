import type { Metadata } from "next";

/** Production origin. Hard-coded so metadata never falls back to localhost. */
export const SITE_ORIGIN = "https://playfitclub.com";

export const HOME_TITLE = "PlayFit Club — You Move. The Game Moves.";

/** 150 characters. Uses the live hero signature and how the game is actually played. */
export const HOME_DESCRIPTION =
  "No buttons. No controllers. Just your body in action. Play Fit Run on your phone, then mirror that phone screen to a TV or laptop.";

export const OG_IMAGE = {
  url: "/marketing/hero-run.jpg",
  width: 864,
  height: 1152,
  alt: "Illustrated home-play scene. A woman jogs in a living room. The television banner reads Run, Move forward.",
  type: "image/jpeg",
};

export const PUBLIC_PATHS = ["/", "/games", "/pricing", "/gyms", "/privacy", "/terms"] as const;

export const organizationJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "PlayFit Club",
      url: SITE_ORIGIN,
      email: "sharunsharo@gmail.com",
      telephone: "+91 95665 51345",
      logo: `${SITE_ORIGIN}/marketing/playfit-club-logo.png`,
    },
    {
      "@type": "WebSite",
      name: "PlayFit Club",
      url: SITE_ORIGIN,
    },
  ],
};

const INDEXABLE = { index: true, follow: true } as const;
const PRIVATE = { index: false, follow: false } as const;

/** Kept on every segment title so a nested layout does not drop the brand suffix. */
export const TITLE_TEMPLATE = "%s · PlayFit Club";

export function segmentTitle(title: string): Metadata["title"] {
  return { default: title, template: TITLE_TEMPLATE };
}

export function noIndex(title: string, description: string): Metadata {
  return { title: segmentTitle(title), description, robots: PRIVATE };
}

export const homeMetadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  robots: INDEXABLE,
};

export const gamesMetadata: Metadata = {
  title: segmentTitle("Games"),
  description:
    "Fit Run is available now on a television or laptop, with your phone camera as the controller. Fit Fight and Fit Dance are coming soon and do not launch.",
  robots: INDEXABLE,
};

export const pricingMetadata: Metadata = {
  title: segmentTitle("Pricing"),
  description:
    "Listed prices only: free demo ₹0, Individual Pro ₹999, Gym Starter ₹19,999, and Gym Pro ₹39,999. A WhatsApp message is an enquiry. It does not take payment.",
  robots: INDEXABLE,
};

export const gymsMetadata: Metadata = {
  title: segmentTitle("For gyms"),
  description:
    "A gym buys member seats so members play FitRunner at home. The game is not installed in the gym. An enquiry does not assign a seat or start a subscription.",
  robots: INDEXABLE,
};

export const privacyMetadata: Metadata = {
  title: segmentTitle("Privacy"),
  description:
    "Pose tracking runs in the phone browser. Camera frames are not uploaded or stored. PlayFit Club does not keep images, recordings, or biometric templates.",
  robots: INDEXABLE,
};

export const termsMetadata: Metadata = {
  title: segmentTitle("Terms"),
  description:
    "PlayFit Club has not published terms of service yet. This page is not a contract. The game estimates movement and does not judge exercise form.",
  robots: INDEXABLE,
};
