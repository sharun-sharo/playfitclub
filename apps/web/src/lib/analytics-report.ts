import { createSign } from "node:crypto";
import {
  dashboardLinks,
  readAudienceCounts,
  readEventCount,
  readGaGrouped,
  readGaMetrics,
  readGrouped,
  readVisitCount,
  reportingFlags,
  type BreakdownRow,
} from "@/lib/analytics";

export interface ProviderReport {
  failed: boolean;
  visitors: number | null;
  pageViews: number | null;
  pages: BreakdownRow[] | null;
  sources: BreakdownRow[] | null;
  devices: BreakdownRow[] | null;
  playerEnquiries: number | null;
  gymEnquiries: number | null;
  playClicks: number | null;
}

export interface AnalyticsReport {
  links: { vercel: string; ga4: string };
  vercel: ProviderReport | null;
  ga4: ProviderReport | null;
}

const RANGE = "Last 28 days";
const VERCEL_API = "https://api.vercel.com/v1/query/web-analytics";

export function reportRangeLabel() {
  return RANGE;
}

export async function loadAnalyticsReport(env: Record<string, string | undefined> = process.env): Promise<AnalyticsReport> {
  const flags = reportingFlags(env);
  const links = dashboardLinks(env);
  const [vercel, ga4] = await Promise.all([
    flags.vercel ? loadVercel(env) : Promise.resolve(null),
    flags.ga4 ? loadGa4(env) : Promise.resolve(null),
  ]);
  return { links, vercel, ga4 };
}

async function loadVercel(env: Record<string, string | undefined>): Promise<ProviderReport> {
  const token = env.VERCEL_ANALYTICS_ACCESS_TOKEN?.trim() ?? "";
  const projectId = env.VERCEL_ANALYTICS_PROJECT_ID?.trim() ?? "";
  const teamId = env.VERCEL_ANALYTICS_TEAM_ID?.trim();
  const { since, until } = last28Days();
  const common: Record<string, string> = { projectId, since, until };
  if (teamId && /^[A-Za-z0-9_-]{1,80}$/.test(teamId)) common.teamId = teamId;
  const [totals, pages, sources, devices, enquiries, plays] = await Promise.all([
    vercelGet("visits/count", common, token),
    vercelGet("visits/aggregate", { ...common, by: "requestPath", limit: "8" }, token),
    vercelGet("visits/aggregate", { ...common, by: "referrerHostname", limit: "8" }, token),
    vercelGet("visits/aggregate", { ...common, by: "deviceType", limit: "8" }, token),
    vercelGet(
      "events/aggregate",
      { ...common, by: "eventData/audience", filter: "eventName eq 'whatsapp_enquiry_clicked'", limit: "8" },
      token,
    ),
    vercelGet("events/count", { ...common, filter: "eventName eq 'play_clicked'" }, token),
  ]);
  const visit = readVisitCount(totals);
  const audience = readAudienceCounts(enquiries);
  const report: ProviderReport = {
    failed: false,
    visitors: visit?.visitors ?? null,
    pageViews: visit?.pageViews ?? null,
    pages: readGrouped(pages, "requestPath"),
    sources: readGrouped(sources, "referrerHostname"),
    devices: readGrouped(devices, "deviceType"),
    playerEnquiries: audience?.player ?? null,
    gymEnquiries: audience?.gym ?? null,
    playClicks: readEventCount(plays),
  };
  report.failed = report.visitors === null && report.pageViews === null && report.pages === null && report.playerEnquiries === null;
  return report;
}

async function loadGa4(env: Record<string, string | undefined>): Promise<ProviderReport> {
  const propertyId = env.GA4_PROPERTY_ID?.trim() ?? "";
  const email = env.GA4_CLIENT_EMAIL?.trim() ?? "";
  const key = env.GA4_PRIVATE_KEY ?? "";
  const token = await googleAccessToken(email, key);
  if (!token) return emptyFailed();
  const [totals, pages, sources, devices, enquiries, plays] = await Promise.all([
    gaReport(propertyId, token, { metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }] }),
    gaReport(propertyId, token, {
      dimensions: [{ name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      limit: 8,
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    }),
    gaReport(propertyId, token, {
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      limit: 8,
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    }),
    gaReport(propertyId, token, {
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }],
      limit: 8,
    }),
    gaReport(propertyId, token, {
      dimensions: [{ name: "customEvent:audience" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "whatsapp_enquiry_clicked" } },
      },
    }),
    gaReport(propertyId, token, {
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "play_clicked" } },
      },
    }),
  ]);
  const metrics = readGaMetrics(totals);
  const audienceRows = readGaGrouped(enquiries);
  const report: ProviderReport = {
    failed: false,
    visitors: metrics && metrics.length > 0 ? metrics[0] : metrics ? 0 : null,
    pageViews: metrics && metrics.length > 1 ? metrics[1] : metrics ? 0 : null,
    pages: readGaGrouped(pages),
    sources: readGaGrouped(sources),
    devices: readGaGrouped(devices),
    playerEnquiries: audienceCount(audienceRows, "player"),
    gymEnquiries: audienceCount(audienceRows, "gym"),
    playClicks: readGaMetrics(plays)?.[0] ?? (readGaMetrics(plays) ? 0 : null),
  };
  report.failed = report.visitors === null && report.pageViews === null && report.pages === null && report.playerEnquiries === null;
  return report;
}

function audienceCount(rows: BreakdownRow[] | null, audience: "player" | "gym") {
  if (!rows) return null;
  return rows.filter((row) => row.label === audience).reduce((sum, row) => sum + (row.count ?? row.pageViews ?? 0), 0);
}

function emptyFailed(): ProviderReport {
  return {
    failed: true,
    visitors: null,
    pageViews: null,
    pages: null,
    sources: null,
    devices: null,
    playerEnquiries: null,
    gymEnquiries: null,
    playClicks: null,
  };
}

async function vercelGet(path: string, params: Record<string, string>, token: string) {
  try {
    const url = new URL(`${VERCEL_API}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function gaReport(propertyId: string, token: string, body: Record<string, unknown>) {
  try {
    const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ dateRanges: [{ startDate: "28daysAgo", endDate: "today" }], ...body }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function googleAccessToken(email: string, privateKey: string) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = base64url(
      JSON.stringify({
        iss: email,
        scope: "https://www.googleapis.com/auth/analytics.readonly",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claim}`);
    signer.end();
    const signature = signer.sign(privateKey.replace(/\\n/g, "\n")).toString("base64url");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claim}.${signature}`,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { access_token?: unknown };
    return typeof body.access_token === "string" ? body.access_token : null;
  } catch {
    return null;
  }
}

function base64url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function last28Days() {
  const until = new Date();
  const since = new Date(until.getTime() - 28 * 24 * 60 * 60 * 1000);
  const day = (date: Date) => date.toISOString().slice(0, 10);
  return { since: day(since), until: day(until) };
}
