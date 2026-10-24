import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TvRemote } from "./tv-remote";
import "./tv.css";

export const metadata: Metadata = {
  title: "FitRunner on TV — PlayFit Club",
  description: "FitRunner on a television. The phone is the controller.",
  robots: { index: false, follow: false },
};

export default function TvLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tv-shell" data-tv-shell="">
      <TvRemote />
      {children}
    </div>
  );
}
