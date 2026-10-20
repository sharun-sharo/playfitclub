import { publicResult } from "@fitplay/db";
import { jsonError } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ shareSlug: string }> }) {
  const { shareSlug } = await context.params;
  const result = await publicResult(shareSlug);
  if (!result) return jsonError(404, "NOT_FOUND", "That result is not public.");
  return Response.json({ result });
}
