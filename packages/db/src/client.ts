import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  fitplayPrisma?: PrismaClient;
  fitplayPrismaReloaded?: boolean;
  fitplayBillingReloaded?: boolean;
  fitplayGymReloaded?: boolean;
  fitplayPhoneReloaded?: boolean;
};

function logLevels(): Array<"error" | "warn"> {
  return process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"];
}

function hasEngagementModels(client: PrismaClient) {
  const models = client as PrismaClient & {
    dailyMission?: { findMany?: unknown };
    workoutSession?: { findMany?: unknown };
    subscription?: { findMany?: unknown };
    auditLog?: { findMany?: unknown };
  };
  return (
    typeof models.dailyMission?.findMany === "function" &&
    typeof models.workoutSession?.findMany === "function" &&
    typeof models.subscription?.findMany === "function" &&
    typeof models.auditLog?.findMany === "function"
  );
}

function modelFieldNames(client: PrismaClient, model: string) {
  const fields = (client as PrismaClient & { _runtimeDataModel?: { models?: Record<string, { fields?: Array<{ name: string }> }> } })._runtimeDataModel?.models?.[model]?.fields;
  return new Set(fields?.map((field) => field.name));
}

function hasMembershipHistory(client: PrismaClient) {
  const names = modelFieldNames(client, "GymMembership");
  return names.has("status") && names.has("endedAt");
}

function hasUserPhone(client: PrismaClient) {
  return modelFieldNames(client, "User").has("phone");
}

/** The dev server can keep a Prisma client from before a migration existed. Reload the generated client once. */
function reloadPrismaClient(): PrismaClient {
  const require = createRequire(pathToFileURL(`${process.cwd()}/package.json`));
  for (const key of Object.keys(require.cache)) {
    if (key.includes("/.prisma/client/") || key.includes("/@prisma/client/") || key.includes("\\.prisma\\client\\") || key.includes("\\@prisma\\client\\")) {
      delete require.cache[key];
    }
  }
  const loaded = require("@prisma/client") as { PrismaClient: typeof PrismaClient };
  return new loaded.PrismaClient({ log: logLevels() });
}

export function getPrisma(): PrismaClient {
  const cached = globalForPrisma.fitplayPrisma;
  if (cached && hasEngagementModels(cached) && hasMembershipHistory(cached) && hasUserPhone(cached)) return cached;
  const needsPhone = !!cached && !hasUserPhone(cached) && !globalForPrisma.fitplayPhoneReloaded;
  const needsLegacyReload =
    !!cached &&
    (!hasEngagementModels(cached) || !hasMembershipHistory(cached)) &&
    (!globalForPrisma.fitplayPrismaReloaded || !globalForPrisma.fitplayBillingReloaded || !globalForPrisma.fitplayGymReloaded);
  if (cached && (needsPhone || needsLegacyReload)) {
    const fresh = reloadPrismaClient();
    if (needsLegacyReload) {
      globalForPrisma.fitplayPrismaReloaded = true;
      globalForPrisma.fitplayBillingReloaded = true;
      globalForPrisma.fitplayGymReloaded = true;
    }
    if (needsPhone) globalForPrisma.fitplayPhoneReloaded = hasUserPhone(fresh);
    if (hasUserPhone(fresh) || needsLegacyReload) {
      void cached.$disconnect().catch(() => undefined);
      globalForPrisma.fitplayPrisma = fresh;
      return fresh;
    }
  }
  if (!cached) {
    globalForPrisma.fitplayPrisma = new PrismaClient({ log: logLevels() });
  }
  return globalForPrisma.fitplayPrisma as PrismaClient;
}
