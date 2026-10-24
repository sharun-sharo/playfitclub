import { createDeskSubscription, listSubscriptionDesk, quoteDeskSubscription } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

const periods = new Set(["MONTHLY", "QUARTERLY", "YEARLY"]);
const payments = new Set(["PAID", "PENDING", "PARTIAL"]);

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const url = new URL(request.url);
  try {
    const desk = await listSubscriptionDesk({ q: url.searchParams.get("q") ?? undefined, filter: url.searchParams.get("filter") ?? undefined });
    return Response.json(desk);
  } catch (error) {
    return billingFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const actor = await requireSuperAdmin();
  if (!actor?.sub) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const body = (await request.json().catch(() => null)) as {
    intent?: string;
    customerType?: "player" | "gym";
    name?: string;
    phone?: string;
    planCode?: string;
    paymentStatus?: "PAID" | "PENDING" | "PARTIAL";
    period?: "MONTHLY" | "QUARTERLY" | "YEARLY";
    startsOn?: string;
    endsOn?: string;
    seatLimit?: number | null;
    receivedInr?: number;
    confirmedId?: string | null;
    createAccount?: boolean;
  } | null;
  if (!body?.customerType || (body.customerType !== "player" && body.customerType !== "gym")) return jsonError(400, "INVALID", "Choose a player or a gym.");
  if (!body.planCode || !body.paymentStatus || !payments.has(body.paymentStatus)) return jsonError(400, "INVALID", "Choose a plan and a payment status.");
  if (body.period && !periods.has(body.period)) return jsonError(400, "INVALID", "Choose a monthly, quarterly, or yearly period.");
  const fields = {
    customerType: body.customerType,
    name: body.name ?? "",
    phone: body.phone ?? "",
    planCode: body.planCode,
    paymentStatus: body.paymentStatus,
    period: body.period,
    startsOn: body.startsOn,
    endsOn: body.endsOn,
    seatLimit: body.seatLimit,
    receivedInr: body.receivedInr,
  };
  if (body.intent === "preview") {
    const preview = quoteDeskSubscription(fields);
    if (!preview.ok) return jsonError(400, "INVALID", preview.message);
    return Response.json({ ok: true, preview: preview.preview });
  }
  try {
    const created = await createDeskSubscription({ id: actor.sub, role: actor.role }, { ...fields, confirmedId: body.confirmedId, createAccount: body.createAccount });
    return Response.json(created);
  } catch (error) {
    return billingFailure(error);
  }
}
