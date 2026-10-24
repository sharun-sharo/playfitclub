import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { Outfit, Oxanium } from "next/font/google";
import { SiteAnalytics } from "@/components/analytics/site-analytics";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const oxanium = Oxanium({ subsets: ["latin"], variable: "--font-oxanium" });

export const metadata: Metadata = {
  title: "PlayFit Club",
  description: "Turn a television into a body-controlled fitness arcade. Scan, move, and play.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${oxanium.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        <Suspense fallback={null}>
          <SiteAnalytics />
        </Suspense>
      </body>
    </html>
  );
}
