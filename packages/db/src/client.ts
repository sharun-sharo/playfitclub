import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { fitplayPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.fitplayPrisma) {
    globalForPrisma.fitplayPrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }
  return globalForPrisma.fitplayPrisma;
}
