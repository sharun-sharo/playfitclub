export const ANALYTICS_EVENTS = [
  "play_clicked",
  "pricing_viewed",
  "individual_plan_selected",
  "gym_plan_selected",
  "get_started_clicked",
  "whatsapp_enquiry_clicked",
  "login_completed",
  "fit_run_selected",
  "phone_pairing_completed",
  "game_started",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

const EVENT_NAMES = new Set<string>(ANALYTICS_EVENTS);
const SURFACES = new Set(["home", "tv", "library", "pricing", "header", "nav", "footer", "register", "gyms", "account"]);
const PLANS = new Set(["individual_pro", "gym_starter", "gym_pro", "gym"]);
const AUDIENCES = new Set(["player", "gym"]);

const EVENT_FIELD: Record<AnalyticsEventName, { key: string; allowed: Set<string> } | null> = {
  play_clicked: { key: "surface", allowed: SURFACES },
  fit_run_selected: { key: "surface", allowed: SURFACES },
  get_started_clicked: { key: "surface", allowed: SURFACES },
  individual_plan_selected: { key: "plan", allowed: PLANS },
  gym_plan_selected: { key: "plan", allowed: PLANS },
  whatsapp_enquiry_clicked: { key: "audience", allowed: AUDIENCES },
  game_started: { key: "game", allowed: new Set(["fit_run"]) },
  pricing_viewed: null,
  login_completed: null,
  phone_pairing_completed: null,
};

export interface PublicEvent {
  name: AnalyticsEventName;
  params: Record<string, string>;
}

export interface PageViewCommand {
  name: "page_view";
  params: { page_path: string; page_location: string };
}

const GA_ID = /^G-[A-Z0-9]+$/;
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function gaMeasurementId(env: Record<string, string | undefined> = process.env): string | null {
  const id = env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "";
  return GA_ID.test(id) ? id : null;
}

/** GA config must not send its own page view. Our helper sends the only one. */
export function gaBootstrap(measurementId: string | null): { measurementId: string; sendPageView: false } | null {
  if (!measurementId || !GA_ID.test(measurementId)) return null;
  return { measurementId, sendPageView: false };
}

export function planPageView(input: {
  measurementId: string | null;
  path: string;
  previousKey: string | null;
}): { commands: PageViewCommand[]; nextKey: string | null } {
  if (!gaMeasurementId({ NEXT_PUBLIC_GA_MEASUREMENT_ID: input.measurementId ?? undefined })) {
    return { commands: [], nextKey: input.previousKey };
  }
  const pagePath = analyticsPath(input.path);
  if (input.previousKey === pagePath) return { commands: [], nextKey: input.previousKey };
  return {
    commands: [{ name: "page_view", params: { page_path: pagePath, page_location: pagePath } }],
    nextKey: pagePath,
  };
}

export function commandsForNavigation(measurementId: string | null, path: string, previousKey: string | null) {
  const page = planPageView({ measurementId, path, previousKey });
  return {
    bootstrap: gaBootstrap(measurementId),
    pageViews: page.commands.filter((command) => command.name === "page_view"),
    nextKey: page.nextKey,
  };
}

export function buildEvent(name: string, params: Record<string, unknown> = {}): PublicEvent | null {
  if (!EVENT_NAMES.has(name)) return null;
  const eventName = name as AnalyticsEventName;
  const spec = EVENT_FIELD[eventName];
  const clean: Record<string, string> = {};
  if (spec) {
    const value = params[spec.key];
    if (typeof value !== "string" || !spec.allowed.has(value)) {
      if (eventName === "whatsapp_enquiry_clicked") return null;
    } else {
      clean[spec.key] = value;
    }
  }
  return { name: eventName, params: clean };
}

export function analyticsPath(input: string): string {
  const sanitized = sanitizeAnalyticsUrl(input);
  if (/^https?:\/\//i.test(sanitized)) {
    try {
      const url = new URL(sanitized);
      const search = url.searchParams.toString();
      return search ? `${url.pathname}?${search}` : url.pathname || "/";
    } catch {
      return "/";
    }
  }
  return sanitized || "/";
}

export function sanitizeAnalyticsUrl(input: string): string {
  const absolute = /^https?:\/\//i.test(input);
  let url: URL;
  try {
    url = new URL(input, "https://playfit.local");
  } catch {
    return "/";
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (shouldDropQuery(key, url.searchParams.get(key) ?? "")) url.searchParams.delete(key);
  }
  url.pathname = url.pathname.replace(/\/join\/[^/]+/gi, "/join");
  if (!url.pathname.startsWith("/")) url.pathname = `/${url.pathname}`;
  if (absolute) return url.toString();
  const search = url.searchParams.toString();
  return search ? `${url.pathname}?${search}` : url.pathname || "/";
}

function shouldDropQuery(key: string, value: string): boolean {
  const lower = key.toLowerCase();
  if (lower === "next") return nextHasSecret(value);
  if (lower === "token" || lower === "code" || lower === "email" || lower === "phone") return true;
  if (lower.includes("token") || lower.includes("email") || lower.includes("phone")) return true;
  if (lower.endsWith("code")) return true;
  return false;
}

function nextHasSecret(value: string): boolean {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  if (/\/join\/[^/?#]+/i.test(decoded)) return true;
  if (/[?&](token|code|email|phone)=/i.test(decoded)) return true;
  if (/\b(token|email|phone)=/i.test(decoded)) return true;
  if (decoded.includes("@")) return true;
  return false;
}

export function reportingFlags(env: Record<string, string | undefined> = process.env): { vercel: boolean; ga4: boolean } {
  const token = env.VERCEL_ANALYTICS_ACCESS_TOKEN?.trim() ?? "";
  const projectId = env.VERCEL_ANALYTICS_PROJECT_ID?.trim() ?? "";
  const propertyId = env.GA4_PROPERTY_ID?.trim() ?? "";
  const email = env.GA4_CLIENT_EMAIL?.trim() ?? "";
  const key = env.GA4_PRIVATE_KEY?.trim() ?? "";
  return {
    vercel: Boolean(token && !/[\r\n]/.test(token) && SAFE_ID.test(projectId)),
    ga4: Boolean(/^\d+$/.test(propertyId) && email.includes("@") && key),
  };
}

export function dashboardLinks(env: Record<string, string | undefined> = process.env) {
  return {
    vercel: httpsLink(env.VERCEL_ANALYTICS_DASHBOARD_URL, "https://vercel.com/dashboard"),
    ga4: httpsLink(env.GA4_DASHBOARD_URL, "https://analytics.google.com/analytics/web/"),
  };
}

function httpsLink(value: string | undefined, fallback: string) {
  if (!value?.trim()) return fallback;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export function asCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

export function readVisitCount(body: unknown): { pageViews: number; visitors: number } | null {
  const data = recordData(body);
  if (!data || Array.isArray(data)) return null;
  const pageViews = asCount(data.pageviews);
  const visitors = asCount(data.visitors);
  if (pageViews === null || visitors === null) return null;
  return { pageViews, visitors };
}

export function readEventCount(body: unknown): number | null {
  const data = recordData(body);
  if (!data || Array.isArray(data)) return null;
  return asCount(data.count);
}

export interface BreakdownRow {
  label: string;
  pageViews: number | null;
  visitors: number | null;
  count: number | null;
}

export function readGrouped(body: unknown, labelKey: string): BreakdownRow[] | null {
  const data = recordData(body);
  if (!Array.isArray(data)) return null;
  const rows: BreakdownRow[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const raw = record[labelKey];
    const label = raw === "" ? "(direct)" : typeof raw === "string" ? displayLabel(raw, labelKey) : null;
    if (!label) continue;
    const pageViews = asCount(record.pageviews);
    const visitors = asCount(record.visitors);
    const count = asCount(record.count);
    if (pageViews === null && visitors === null && count === null) continue;
    rows.push({ label, pageViews, visitors, count });
  }
  return rows;
}

export function readAudienceCounts(body: unknown): { player: number; gym: number } | null {
  const rows = readGrouped(body, "eventData");
  if (!rows) return null;
  let player = 0;
  let gym = 0;
  for (const row of rows) {
    if (row.count === null) continue;
    if (row.label === "player") player += row.count;
    if (row.label === "gym") gym += row.count;
  }
  return { player, gym };
}

export function conversionRate(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole <= 0) return null;
  return part / whole;
}

function recordData(body: unknown): Record<string, unknown> | unknown[] | null {
  if (!body || typeof body !== "object") return null;
  if ("error" in body) return null;
  const data = (body as { data?: unknown }).data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return null;
}

function displayLabel(value: string, labelKey: string): string | null {
  if (value.length > 160 || value.includes("@")) return null;
  if (labelKey === "requestPath" || value.startsWith("/")) return analyticsPath(value.startsWith("/") ? value : `/${value}`);
  if (/token|email|phone/i.test(value)) return null;
  return value;
}

export function readGaMetrics(body: unknown): number[] | null {
  if (!body || typeof body !== "object" || "error" in body) return null;
  const record = body as { rows?: unknown; metricHeaders?: unknown };
  if (!Array.isArray(record.metricHeaders) && !Array.isArray(record.rows)) return null;
  const rows = Array.isArray(record.rows) ? record.rows : [];
  if (rows.length === 0) return [];
  const first = rows[0] as { metricValues?: Array<{ value?: unknown }> };
  if (!Array.isArray(first?.metricValues)) return null;
  const metrics = first.metricValues.map((item) => asCount(item?.value));
  if (metrics.some((value) => value === null)) return null;
  return metrics as number[];
}

export function readGaGrouped(body: unknown): BreakdownRow[] | null {
  if (!body || typeof body !== "object" || "error" in body) return null;
  const record = body as { rows?: unknown; dimensionHeaders?: unknown };
  if (!Array.isArray(record.dimensionHeaders) && !Array.isArray(record.rows)) return null;
  const rows = Array.isArray(record.rows) ? record.rows : [];
  const parsed: BreakdownRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as { dimensionValues?: Array<{ value?: unknown }>; metricValues?: Array<{ value?: unknown }> };
    const raw = item.dimensionValues?.[0]?.value;
    if (typeof raw !== "string") continue;
    const label = displayLabel(raw, raw.startsWith("/") ? "requestPath" : "text");
    if (!label) continue;
    const metrics = (item.metricValues ?? []).map((metric) => asCount(metric?.value));
    parsed.push({
      label,
      pageViews: metrics[0] ?? null,
      visitors: metrics[1] ?? null,
      count: metrics.length === 1 ? metrics[0] ?? null : null,
    });
  }
  return parsed;
}
