import type { ReactNode } from "react";
import Link from "next/link";
import { TrackedLink } from "@/components/analytics/tracked-link";
import { FaqList } from "@/components/marketing/faq-list";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarketingFrame } from "@/components/marketing/frame";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";
import { breadcrumbJsonLd } from "@/lib/site-metadata";

export type SeoLandingFaq = { q: string; a: string };

export type SeoLandingImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
};

export function SeoLanding({
  kicker,
  title,
  lead,
  crumbs,
  image,
  children,
  faqs,
  related,
  jsonLd,
  surface = "landing",
}: {
  kicker: string;
  title: string;
  lead: string;
  crumbs: ReadonlyArray<{ name: string; path: string }>;
  image: SeoLandingImage;
  children: ReactNode;
  faqs: ReadonlyArray<SeoLandingFaq>;
  related: ReadonlyArray<{ href: string; label: string }>;
  jsonLd?: unknown;
  surface?: "landing" | "home";
}) {
  return (
    <MarketingFrame classic>
      {jsonLd ? <JsonLd data={jsonLd} /> : null}
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <SiteNav prefix="/" logo="footer" />
      <main>
        <section className="fp-wrap fp-page" aria-labelledby="seo-hero-title">
          <nav className="fp-seo-crumbs" aria-label="Breadcrumb">
            <ol>
              {crumbs.map((crumb, index) => (
                <li key={crumb.path}>
                  {index < crumbs.length - 1 ? <Link href={crumb.path}>{crumb.name}</Link> : <span aria-current="page">{crumb.name}</span>}
                </li>
              ))}
            </ol>
          </nav>
          <p className="fp-kicker">{kicker}</p>
          <h1 id="seo-hero-title" className="fp-title-wide">
            {title}
          </h1>
          <p className="fp-lead">{lead}</p>
          <div className="fp-actions">
            <TrackedLink className="fp-btn fp-btn-primary" href="/play" events={[{ name: "play_clicked", params: { surface } }]}>
              Play Demo
            </TrackedLink>
            <Link className="fp-btn fp-btn-ghost" href="/fit-run">
              About Fit Run
            </Link>
          </div>
          <figure className="fp-seo-figure">
            <img src={image.src} alt={image.alt} width={image.width} height={image.height} loading="eager" decoding="async" fetchPriority="high" />
          </figure>
        </section>

        {children}

        <section className="fp-section" aria-labelledby="seo-faq-title">
          <div className="fp-wrap fp-split">
            <div>
              <p className="fp-kicker">Questions</p>
              <h2 id="seo-faq-title">Before you play.</h2>
            </div>
            <FaqList items={faqs} />
          </div>
        </section>

        <section className="fp-section" aria-labelledby="seo-related-title">
          <div className="fp-wrap">
            <h2 id="seo-related-title">Explore more</h2>
            <p className="fp-lead">PlayFit Club currently offers Fit Run. These pages explain how to play from different angles.</p>
            <ul className="fp-seo-related">
              {related.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
            <div className="fp-actions">
              <TrackedLink className="fp-btn fp-btn-primary" href="/play" events={[{ name: "play_clicked", params: { surface } }]}>
                Play Demo
              </TrackedLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter prefix="/" />
    </MarketingFrame>
  );
}

export function SeoRequirements() {
  return (
    <div className="fp-help">
      <article>
        <h3>What you need</h3>
        <ul>
          <li>A laptop with a webcam, or a phone with a front camera, in a modern browser.</li>
          <li>Camera permission when the browser asks.</li>
          <li>Your body in frame from head through knees, with space to jump and squat.</li>
          <li>Good light facing you—not a bright window behind you.</li>
        </ul>
      </article>
      <article>
        <h3>How Fit Run plays</h3>
        <ul>
          <li>Step or lean left/right to change lanes.</li>
          <li>Jump to clear low barriers.</li>
          <li>Squat to slide under high barriers.</li>
          <li>Frames stay on your device; pose is estimated in the browser.</li>
        </ul>
      </article>
    </div>
  );
}
