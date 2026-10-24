import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { requireSuperAdmin } from "@/lib/billing-http";
import { conversionRate, type BreakdownRow } from "@/lib/analytics";
import { loadAnalyticsReport, reportRangeLabel, type ProviderReport } from "@/lib/analytics-report";

export default function AdminAnalyticsPage() {
  return (
    <AppShell>
      <Suspense fallback={<AnalyticsFallback />}>
        <AdminAnalyticsReport />
      </Suspense>
    </AppShell>
  );
}

function AnalyticsFallback() {
  return (
    <main id="content" className="fp-wrap fp-page fp-console">
      <Link className="fp-text-link" href="/admin">
        Back to control
      </Link>
      <p className="fp-kicker">Super Admin</p>
      <h1>Analytics</h1>
      <p className="fp-lead">Loading analytics…</p>
    </main>
  );
}

async function AdminAnalyticsReport() {
  const user = await requireSuperAdmin();
  if (!user) redirect("/dashboard");
  const report = await loadAnalyticsReport();
  const range = reportRangeLabel();

  return (
    <main id="content" className="fp-wrap fp-page fp-console">
      <Link className="fp-text-link" href="/admin">
        Back to control
      </Link>
      <p className="fp-kicker">Super Admin</p>
      <h1>Analytics</h1>
      <p className="fp-lead">
        Visitors, page views, popular pages, sources, devices, enquiries, and conversion rates appear here only when a reporting API returns them. This page does not estimate those numbers.
      </p>
      {report.vercel || report.ga4 ? (
        <>
          <ProviderSection title="Vercel Analytics" range={range} report={report.vercel} href={report.links.vercel} />
          <ProviderSection title="GA4" range={range} report={report.ga4} href={report.links.ga4} />
        </>
      ) : (
        <section className="fp-card">
          <h2>Numbers are not available here</h2>
          <p>
            Vercel Analytics and GA4 hold the visitor counts, page views, popular pages, sources, devices, player enquiries, gym enquiries, and conversion rates. No reporting API is configured for this server, so this page does not show those figures.
          </p>
          <div className="fp-actions">
            <a className="fp-btn fp-btn-primary" href={report.links.vercel} target="_blank" rel="noopener noreferrer">
              Open Vercel Analytics
            </a>
            <a className="fp-btn fp-btn-ghost" href={report.links.ga4} target="_blank" rel="noopener noreferrer">
              Open GA4
            </a>
          </div>
        </section>
      )}
    </main>
  );
}

function ProviderSection({ title, range, report, href }: { title: string; range: string; report: ProviderReport | null; href: string }) {
  if (!report || report.failed) {
    return (
      <section className="fp-card">
        <h2>{title}</h2>
        <p>
          {title} numbers are not available here. {range} of visitors, page views, popular pages, sources, devices, enquiries, and conversion rates stay in the {title} dashboard.
        </p>
        <a className="fp-btn fp-btn-ghost" href={href} target="_blank" rel="noopener noreferrer">
          Open {title}
        </a>
      </section>
    );
  }

  const playerRate = formatRate(report.playerEnquiries, report.visitors);
  const gymRate = formatRate(report.gymEnquiries, report.visitors);
  const playRate = formatRate(report.playClicks, report.visitors);

  return (
    <section className="fp-card">
      <h2>{title}</h2>
      <p className="fp-status">{range}, returned by the {title} reporting API.</p>
      <div className="fp-stats">
        <Stat label="Visitors" value={report.visitors} />
        <Stat label="Page views" value={report.pageViews} />
        <Stat label="Player enquiries" value={report.playerEnquiries} />
        <Stat label="Gym enquiries" value={report.gymEnquiries} />
      </div>
      <Breakdown title="Popular pages" rows={report.pages} />
      <Breakdown title="Sources" rows={report.sources} />
      <Breakdown title="Devices" rows={report.devices} />
      <h3>Conversion rates</h3>
      {playerRate || gymRate || playRate ? (
        <ul className="fp-stack">
          {playerRate ? <li>Player enquiries / visitors: {playerRate}</li> : null}
          {gymRate ? <li>Gym enquiries / visitors: {gymRate}</li> : null}
          {playRate ? <li>Play clicks / visitors: {playRate}</li> : null}
        </ul>
      ) : (
        <p>Conversion rates are not available here.</p>
      )}
      <a className="fp-btn fp-btn-ghost" href={href} target="_blank" rel="noopener noreferrer">
        Open {title}
      </a>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <article className="fp-stat">
      <p className="fp-kicker">{label}</p>
      <strong>{value === null ? "Not available here" : value}</strong>
    </article>
  );
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] | null }) {
  return (
    <>
      <h3>{title}</h3>
      {rows === null ? <p>{title} are not available here.</p> : null}
      {rows && rows.length === 0 ? <p>The reporting API returned no rows for this period.</p> : null}
      {rows && rows.length > 0 ? (
        <ul className="fp-stack">
          {rows.map((row) => (
            <li key={`${title}-${row.label}`}>
              {row.label}
              {row.pageViews !== null ? ` · ${row.pageViews} page views` : ""}
              {row.visitors !== null ? ` · ${row.visitors} visitors` : ""}
              {row.count !== null ? ` · ${row.count}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function formatRate(part: number | null, whole: number | null) {
  const rate = conversionRate(part, whole);
  if (rate === null) return null;
  return `${(rate * 100).toFixed(1)}%`;
}
