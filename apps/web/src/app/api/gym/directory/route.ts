import { ownerDirectory } from "@fitplay/db";
import { requireUser } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export async function GET(request: Request) {
  const user = await requireUser(["GYM_OWNER"]);
  if (!user?.sub) return jsonError(403, "FORBIDDEN", "Only the gym owner can open this directory.");
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
  const directory = await ownerDirectory(user.sub, user.role, {
    q: url.searchParams.get("q") ?? undefined,
    filter: url.searchParams.get("filter") ?? undefined,
    page,
    pageSize,
  });
  if (!directory) return jsonError(403, "FORBIDDEN", "Only the gym owner can open this directory.");
  return Response.json(directory);
}
