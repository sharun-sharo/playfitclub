import type { MetadataRoute } from "next";
import { PUBLIC_PATHS, SITE_ORIGIN } from "@/lib/site-metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`,
  }));
}
