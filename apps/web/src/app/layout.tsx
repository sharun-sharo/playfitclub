import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Outfit, Oxanium } from "next/font/google";
import { SiteAnalytics } from "@/components/analytics/site-analytics";
import { ScreenRemote } from "@/components/tv/screen-remote";
import { TvDiagnosticsOverlay } from "@/components/tv/tv-diagnostics-overlay";
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  OG_IMAGE,
  SITE_ORIGIN,
  TITLE_TEMPLATE,
  googleSiteVerification,
  jsonLdScript,
  organizationJsonLd,
} from "@/lib/site-metadata";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14211A",
};

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const oxanium = Oxanium({ subsets: ["latin"], variable: "--font-oxanium" });

const verificationToken = googleSiteVerification();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  applicationName: "PlayFit Club",
  title: {
    default: HOME_TITLE,
    template: TITLE_TEMPLATE,
  },
  description: HOME_DESCRIPTION,
  alternates: { canonical: SITE_ORIGIN },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "PlayFit Club",
    locale: "en_IN",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: SITE_ORIGIN,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [OG_IMAGE],
  },
  ...(verificationToken ? { verification: { google: verificationToken } } : {}),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${oxanium.variable} h-full`}>
      <body className="min-h-full antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationJsonLd) }} />
        {children}
        <ScreenRemote />
        {process.env.NODE_ENV !== "production" ? <TvDiagnosticsOverlay /> : null}
        <Suspense fallback={null}>
          <SiteAnalytics />
        </Suspense>
      </body>
    </html>
  );
}
