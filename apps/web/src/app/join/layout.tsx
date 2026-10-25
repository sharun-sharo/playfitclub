import type { ReactNode } from "react";
import { fpDisplay, fpSans } from "@/components/marketing/fonts";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex("Join a game", "Type the 6-character code on the TV to join a PlayFit Club session.");

export default function JoinLayout({ children }: { children: ReactNode }) {
  return <div className={`${fpDisplay.variable} ${fpSans.variable} min-h-dvh overflow-x-hidden bg-[#07080d]`}>{children}</div>;
}
