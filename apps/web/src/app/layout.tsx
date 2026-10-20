import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Outfit, Oxanium } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const oxanium = Oxanium({ subsets: ["latin"], variable: "--font-oxanium" });

export const metadata: Metadata = {
  title: "PlayFit Club",
  description: "Turn a television into a body-controlled fitness arcade. Scan, move, and play.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${oxanium.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
