import { cancelDeskSubscription, changeDeskPlan, editDeskContact, extendDeskSubscription, previewDeskAction, renewDeskSubscription } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

const periods = new Set(["MONTHLY", "QUARTERLY", "YEARLY"]);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireSuperAdmin();
  if (!actor) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const url = new URL(request.url);
  const kind = url.searchParams.get("preview");
  if (kind !== "renew" && kind !== "extend" && kind !== "plan") return jsonError(400, "INVALID", "Choose renew, extend, or a plan change.");
  const period = url.searchParams.get("period") ?? undefined;
  if (period && !periods.has(period)) return jsonError(400, "INVALID", "Choose a monthly, quarterly, or yearly period.");
  const days = url.searchParams.get("days");
  const { id } = await context.params;
  try {
    const preview = await previewDeskAction(id, {
      kind,
      period: period as "MONTHLY" | "QUARTERLY" | "YEARLY" | undefined,
      days: days ? Number(days) : undefined,
      planCode: url.searchParams.get("planCode") ?? undefined,
    });
    return Response.json({ ok: true, preview });
  } catch (error) {
    return billingFailure(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return jsonError(403, "CSRF", error instanceof Error ? error.message : "Blocked");
  }
  const actor = await requireSuperAdmin();
  if (!actor?.sub) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    period?: "MONTHLY" | "QUARTERLY" | "YEARLY";
    paymentStatus?: "PAID" | "PENDING" | "NONE";
    days?: number;
    planCode?: string;
    name?: string;
    phone?: string;
  } | null;
  const { id } = await context.params;
  const admin = { id: actor.sub, role: actor.role };
  try {
    if (body?.action === "renew") {
      if (!body.period || !periods.has(body.period)) return jsonError(400, "INVALID", "Choose a monthly, quarterly, or yearly period.");
      const paymentStatus = body.paymentStatus ?? "NONE";
      if (!["PAID", "PENDING", "NONE"].includes(paymentStatus)) return jsonError(400, "INVALID", "Choose how to record the payment.");
      const renewed = await renewDeskSubscription(admin, id, { period: body.period, paymentStatus });
      return Response.json({ ok: true, ...renewed });
    }
    if (body?.action === "extend") {
      const extended = await extendDeskSubscription(admin, id, Number(body.days));
      return Response.json({ ok: true, ...extended });
    }
    if (body?.action === "cancel") {
      const cancelled = await cancelDeskSubscription(admin, id);
      return Response.json({ ok: true, ...cancelled });
    }
    if (body?.action === "change_plan") {
      if (!body.planCode) return jsonError(400, "INVALID", "Choose a plan.");
      const changed = await changeDeskPlan(admin, id, body.planCode);
      return Response.json({ ok: true, ...changed });
    }
    if (body?.action === "edit_contact") {
      const edited = await editDeskContact(admin, id, { name: body.name ?? "", phone: body.phone ?? "" });
      return Response.json({ ok: true, ...edited });
    }
    return jsonError(400, "INVALID", "Choose renew, extend, cancel, change plan, or edit.");
  } catch (error) {
    return billingFailure(error);
  }
}
