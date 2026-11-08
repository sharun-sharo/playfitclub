import { describe, expect, it } from "vitest";
import {
  HOME_DESCRIPTION,
  HOME_TITLE,
  PUBLIC_PATHS,
  absoluteUrl,
  breadcrumbJsonLd,
  fitRunSoftwareJsonLd,
  googleSiteVerification,
  jsonLdScript,
  publicPageMetadata,
} from "./site-metadata";

describe("site metadata", () => {
  it("keeps gaming-focused home title and description", () => {
    expect(HOME_TITLE).toContain("Online Running Games");
    expect(HOME_DESCRIPTION.toLowerCase()).toContain("browser");
    expect(HOME_DESCRIPTION.toLowerCase()).toContain("no game download");
  });

  it("lists SEO landing paths for the sitemap", () => {
    expect(PUBLIC_PATHS).toEqual(
      expect.arrayContaining(["/", "/fit-run", "/online-running-games", "/browser-games", "/webcam-games"]),
    );
  });

  it("builds canonical and social metadata for a public page", () => {
    const meta = publicPageMetadata({
      title: "Browser Games",
      description: "Play without downloading.",
      path: "/browser-games",
    });
    expect(meta.alternates).toEqual({ canonical: "/browser-games" });
    expect(meta.openGraph?.url).toBe("https://playfitclub.com/browser-games");
    expect(meta.twitter?.card).toBe("summary_large_image");
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it("only exposes Google verification when env provides a token", () => {
    expect(googleSiteVerification({})).toBeUndefined();
    expect(googleSiteVerification({ GOOGLE_SITE_VERIFICATION: "  " })).toBeUndefined();
    expect(googleSiteVerification({ GOOGLE_SITE_VERIFICATION: "abc-token" })).toBe("abc-token");
    expect(googleSiteVerification({ NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: "pub-token" })).toBe("pub-token");
  });

  it("does not invent Fit Run ratings in structured data", () => {
    expect(JSON.stringify(fitRunSoftwareJsonLd)).not.toMatch(/aggregateRating|ratingValue|reviewCount|UserDownloads/i);
    expect(fitRunSoftwareJsonLd.url).toBe(absoluteUrl("/fit-run"));
    const crumbs = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Fit Run", path: "/fit-run" },
    ]);
    expect(crumbs.itemListElement).toHaveLength(2);
    expect(jsonLdScript({ a: "<script>" })).toContain("\\u003cscript>");
  });
});
