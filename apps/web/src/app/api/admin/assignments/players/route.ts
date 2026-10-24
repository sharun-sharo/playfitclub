import { searchAssignablePlayers } from "@fitplay/db";
import { billingFailure, requireSuperAdmin } from "@/lib/billing-http";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  const actor = await requireSuperAdmin();
  if (!actor) return jsonError(403, "FORBIDDEN", "Super Admin access is required.");
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
  try {
    return Response.json(await searchAssignablePlayers({ q: url.searchParams.get("q") ?? undefined, page, pageSize }));
  } catch (error) {
    return billingFailure(error);
  }
}
