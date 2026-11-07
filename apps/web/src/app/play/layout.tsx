import type { ReactNode } from "react";
import { noIndex } from "@/lib/site-metadata";

export const metadata = noIndex(
  "Play",
  "Choose phone or laptop Fit Run. Your body is the controller.",
);

export default function PlayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-black text-white">
      {/* Start the pose model download as soon as a play route paints. */}
      <link rel="preload" as="fetch" href="/mediapipe/pose_landmarker_lite.task" crossOrigin="anonymous" />
      {children}
    </div>
  );
}
