import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, SITE_ORIGIN } from "@/lib/site-metadata";

const CHANGE_FREQ: Partial<Record<(typeof PUBLIC_PATHS)[number], MetadataRoute.Sitemap[number]["changeFrequency"]>> = {
  "/": "weekly",
  "/games": "weekly",
  "/fit-run": "weekly",
  "/online-running-games": "weekly",
  "/browser-games": "weekly",
  "/webcam-games": "weekly",
  "/pricing": "monthly",
  "/for-gyms": "monthly",
  "/privacy": "yearly",
  "/terms": "yearly",
};

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`,
    changeFrequency: CHANGE_FREQ[path] ?? "monthly",
    priority: path === "/" ? 1 : path === "/fit-run" || path === "/games" ? 0.9 : 0.7,
  }));
}
