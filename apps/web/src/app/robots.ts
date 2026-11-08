import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/account",
        "/activate",
        "/api",
        "/dashboard",
        "/dev",
        "/invite",
        "/join",
        "/login",
        "/play",
        "/register",
        "/results",
        "/subscription",
        "/tv",
      ],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
