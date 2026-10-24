import { searchDeskCustomers } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const url = new URL(request.url);
  const customerType = url.searchParams.get("type");
  if (customerType !== "player" && customerType !== "gym") return jsonError(400, "INVALID", "Choose a player or a gym.");
  try {
    const choice = await searchDeskCustomers({
      customerType,
      name: url.searchParams.get("name") ?? "",
      phone: url.searchParams.get("phone") ?? "",
    });
    return Response.json({
      outcome: choice.outcome,
      message: choice.message,
      canCreate: choice.canCreate,
      matches: choice.matches,
    });
  } catch (error) {
    return billingFailure(error);
  }
}
