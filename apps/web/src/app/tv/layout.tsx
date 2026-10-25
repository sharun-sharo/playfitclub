import type { ReactNode } from "react";
import { tvHomeMetadata } from "@/lib/site-metadata";
import { TvRemote } from "./tv-remote";
import "./tv.css";

export const metadata = tvHomeMetadata;

export default function TvLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tv-shell" data-tv-shell="">
      <TvRemote />
      {children}
    </div>
  );
}
