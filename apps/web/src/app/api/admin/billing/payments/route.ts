import { listPayments, recordPayment } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { assertSameOrigin, jsonError } from "@/lib/http";

const methods = new Set(["CASH", "BANK_TRANSFER", "UPI", "CARD", "OTHER"]);
const statuses = new Set(["PAID", "PENDING", "PARTIAL", "REFUNDED"]);

export async function GET() {
  const actor = await requireSuperAdmin();
  if (!actor) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  try {
    return Response.json({ payments: await listPayments() });
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
    subscriptionId?: string;
    amountInr?: number;
    paidAt?: string;
    method?: string;
    transactionRef?: string;
    invoiceRef?: string;
    status?: string;
    notes?: string;
  } | null;
  if (!body?.subscriptionId || body.amountInr === undefined || !body.method || !body.status) {
    return jsonError(400, "INVALID", "Enter the subscription, amount, method, and payment status.");
  }
  if (!methods.has(body.method) || !statuses.has(body.status)) return jsonError(400, "INVALID", "Check the payment method and status.");
  const paidAt = new Date(body.paidAt ?? Date.now());
  if (Number.isNaN(paidAt.getTime())) return jsonError(400, "INVALID", "Enter a valid payment date.");
  try {
    const payment = await recordPayment(
      { id: actor.sub, role: actor.role },
      {
        subscriptionId: body.subscriptionId,
        amountInr: body.amountInr,
        paidAt,
        method: body.method as "CASH" | "BANK_TRANSFER" | "UPI" | "CARD" | "OTHER",
        transactionRef: body.transactionRef ?? "",
        invoiceRef: body.invoiceRef ?? "",
        status: body.status as "PAID" | "PENDING" | "PARTIAL" | "REFUNDED",
        notes: body.notes ?? "",
      },
    );
    return Response.json({ ok: true, ...payment });
  } catch (error) {
    return billingFailure(error);
  }
}
