import { getPrisma, type BoardPeriod } from "@fitplay/db";

export function boardPeriod(value: string | null): BoardPeriod {
  if (value === "day" || value === "week" || value === "month" || value === "all") return value;
  return "week";
}

export async function gameFilter(slug: string | null): Promise<string | null> {
  if (!slug || slug === "overall") return null;
  const game = await getPrisma().game.findUnique({ where: { slug }, select: { id: true } });
  return game?.id ?? "none";
}
