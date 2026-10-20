import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const days = Number(process.env.GUEST_RETENTION_DAYS || 30);

async function main() {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const guests = await prisma.gameSession.findMany({
    where: {
      ownerId: null,
      createdAt: { lt: cutoff },
      players: { every: { userId: null } },
      status: { in: ["ENDED", "EXPIRED", "CLOSED"] },
    },
    select: { id: true },
  });
  if (guests.length === 0) {
    console.log(JSON.stringify({ level: "info", message: "No guest sessions to prune", days }));
    return;
  }
  const ids = guests.map((session) => session.id);
  await prisma.gameSession.deleteMany({ where: { id: { in: ids } } });
  console.log(JSON.stringify({ level: "info", message: "Pruned guest sessions", count: ids.length, days }));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
