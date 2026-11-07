import type { Metadata } from "next";

/** Production origin. Hard-coded so metadata never falls back to localhost. */
export const SITE_ORIGIN = "https://playfitclub.com";

export const HOME_TITLE = "PlayFit Club – Online Running Games | Play in Your Browser";

/** Broader gaming intent while naming the motion-control differentiator. */
export const HOME_DESCRIPTION =
  "Play online running games using your body as the controller. Enjoy Fit Run in your browser with camera-based motion controls. No game download required.";

export const OG_IMAGE = {
  url: "/marketing/hero-run-adventure.jpg",
  width: 1024,
  height: 682,
  alt: "Woman running in a living room while Fit Run plays on the TV, with neon motion tracking under her feet.",
  type: "image/jpeg",
};

export const PUBLIC_PATHS = [
  "/",
  "/play",
  "/games",
  "/fit-run",
  "/online-running-games",
  "/browser-games",
  "/webcam-games",
  "/pricing",
  "/for-gyms",
  "/privacy",
  "/terms",
] as const;

export type PublicPath = (typeof PUBLIC_PATHS)[number];

const INDEXABLE = { index: true, follow: true } as const;
const PRIVATE = { index: false, follow: false } as const;

/** Kept on every segment title so a nested layout does not drop the brand suffix. */
export const TITLE_TEMPLATE = "%s · PlayFit Club";

export function segmentTitle(title: string): Metadata["title"] {
  return { default: title, template: TITLE_TEMPLATE };
}

export function absoluteUrl(path: PublicPath | string): string {
  if (path === "/") return SITE_ORIGIN;
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function publicPageMetadata(input: {
  title: string;
  description: string;
  path: PublicPath | string;
  absoluteTitle?: boolean;
  image?: typeof OG_IMAGE;
}): Metadata {
  const image = input.image ?? OG_IMAGE;
  const url = absoluteUrl(input.path);
  const title = input.absoluteTitle ? { absolute: input.title } : segmentTitle(input.title);
  return {
    title,
    description: input.description,
    alternates: { canonical: input.path === "/" ? SITE_ORIGIN : input.path },
    robots: INDEXABLE,
    openGraph: {
      type: "website",
      siteName: "PlayFit Club",
      locale: "en_IN",
      url,
      title: input.title,
      description: input.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [image],
    },
  };
}

export function noIndex(title: string, description: string): Metadata {
  return { title: segmentTitle(title), description, robots: PRIVATE };
}

/** HTML meta verification token from env. Empty/unset means no tag. */
export function googleSiteVerification(
  env: Record<string, string | undefined> = {
    GOOGLE_SITE_VERIFICATION: process.env.GOOGLE_SITE_VERIFICATION,
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
): string | undefined {
  const raw = env.GOOGLE_SITE_VERIFICATION ?? env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  const token = raw?.trim();
  return token ? token : undefined;
}

export const homeMetadata: Metadata = publicPageMetadata({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

export const gamesMetadata: Metadata = publicPageMetadata({
  title: "Games",
  description:
    "Fit Run is the playable online running game at PlayFit Club. Run, jump, squat, and dodge with your body in the browser. Fit Fight and Fit Dance are coming soon.",
  path: "/games",
});

export const fitRunMetadata: Metadata = publicPageMetadata({
  title: "Fit Run – 3D Online Running Game with Motion Controls",
  description:
    "Fit Run is a 3D online running game you play in the browser. Use your laptop webcam or phone camera—step, jump, and squat to control the run. No game download.",
  path: "/fit-run",
  image: {
    url: "/marketing/fit-run.jpg",
    width: 960,
    height: 890,
    alt: "Illustration of a woman running in a living room. A phone shows a body outline and a television shows a running game.",
    type: "image/jpeg",
  },
});

export const onlineRunningGamesMetadata: Metadata = publicPageMetadata({
  title: "Online Running Games – Play Fit Run in Your Browser",
  description:
    "Looking for running games online? Play Fit Run, an endless-style 3D runner controlled by your body via webcam or phone camera. Free demo in the browser—no download.",
  path: "/online-running-games",
});

export const browserGamesMetadata: Metadata = publicPageMetadata({
  title: "Browser Games – Play Online Without Downloading",
  description:
    "Play Fit Run as a free browser game on your laptop or phone. No installer—open the page, allow the camera, and move to play. Games without download, with motion controls.",
  path: "/browser-games",
});

export const webcamGamesMetadata: Metadata = publicPageMetadata({
  title: "Webcam Games Online – Camera & Body Movement Controls",
  description:
    "Play webcam games online with Fit Run. Your laptop webcam or phone camera tracks jumps, squats, and lane moves so your body becomes the controller.",
  path: "/webcam-games",
});

export const playMetadata: Metadata = publicPageMetadata({
  title: "Play Fit Run Demo",
  description:
    "Start the free Fit Run demo. Pick phone or laptop, allow the camera, and play an online running game with your body as the controller.",
  path: "/play",
});

export const pricingMetadata: Metadata = publicPageMetadata({
  title: "Pricing",
  description:
    "Free demo ₹0, Individual Pro ₹999, Gym Starter ₹19,999 for up to 49 accounts, Gym Pro ₹39,999 for 50 to 99. This page does not take payment.",
  path: "/pricing",
});

export const gymsMetadata: Metadata = publicPageMetadata({
  title: "For gyms",
  description:
    "Motion-powered games for gyms. Gym Starter ₹19,999 for up to 49 accounts. Gym Pro ₹39,999 for 50 to 99. A demo message does not start a subscription.",
  path: "/for-gyms",
});

export const privacyMetadata: Metadata = publicPageMetadata({
  title: "Privacy",
  description:
    "PlayFit Club privacy notice. The front camera detects jumps, squats, and lane moves on the phone. Video is not stored or sent to the server.",
  path: "/privacy",
});

export const termsMetadata: Metadata = publicPageMetadata({
  title: "Terms",
  description:
    "Terms of use for PlayFit Club. Fit Run is a fitness game on your phone. It is not medical advice. The free demo is ₹0 for 10 minutes of active camera time.",
  path: "/terms",
});

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
      description: HOME_DESCRIPTION,
    },
  ],
};

/** Accurate SoftwareApplication for Fit Run. No invented ratings or download counts. */
export const fitRunSoftwareJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Fit Run",
  applicationCategory: "GameApplication",
  operatingSystem: "Web browser",
  url: absoluteUrl("/fit-run"),
  image: `${SITE_ORIGIN}/marketing/fit-run.jpg`,
  description:
    "A 3D online running game played in the browser with camera-based motion controls. Step or lean to change lanes, jump over low barriers, and squat under high ones.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
    description: "Free demo with limited active camera time. Paid plans are listed on the pricing page.",
  },
  publisher: {
    "@type": "Organization",
    name: "PlayFit Club",
    url: SITE_ORIGIN,
  },
};

export function breadcrumbJsonLd(items: ReadonlyArray<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
