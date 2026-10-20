import { Barlow_Condensed, Space_Grotesk } from "next/font/google";

export const fpDisplay = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-fp-display",
  display: "swap",
});

export const fpSans = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fp-sans",
  display: "swap",
});
