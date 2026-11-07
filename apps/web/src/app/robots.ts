import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/site-metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/join",
        "/api",
        "/dev",
        "/tv",
        "/play/",
        "/dashboard",
        "/account",
        "/login",
        "/register",
        "/activate",
        "/invite",
        "/results",
        "/subscription",
      ],
    },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
    host: SITE_ORIGIN,
  };
}
