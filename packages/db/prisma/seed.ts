import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function ensureMembership(client: PrismaClient, userId: string, gymId: string, role: "OWNER" | "STAFF" | "MEMBER") {
  const existing = await client.gymMembership.findFirst({ where: { userId, gymId, status: "ACTIVE" } });
  if (existing) {
    if (existing.role !== role) await client.gymMembership.update({ where: { id: existing.id }, data: { role } });
    return;
  }
  await client.gymMembership.create({ data: { userId, gymId, role, status: "ACTIVE" } });
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_DEMO !== "true") {
    throw new Error("Refusing to seed demo accounts in production. Set SEED_DEMO=true to override.");
  }
  const password = process.env.DEMO_PASSWORD || "fitplay-demo";
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@fitplay.dev" },
    update: { passwordHash, role: "ADMIN", displayName: "FitPlay Admin" },
    create: { email: "admin@fitplay.dev", passwordHash, role: "ADMIN", displayName: "FitPlay Admin" },
  });
  const owner = await prisma.user.upsert({
    where: { email: "owner@fitplay.dev" },
    update: { passwordHash, role: "GYM_OWNER", displayName: "Nova Hale" },
    create: { email: "owner@fitplay.dev", passwordHash, role: "GYM_OWNER", displayName: "Nova Hale" },
  });
  const player = await prisma.user.upsert({
    where: { email: "player@fitplay.dev" },
    update: { passwordHash, role: "PLAYER", displayName: "Ari Lane" },
    create: { email: "player@fitplay.dev", passwordHash, role: "PLAYER", displayName: "Ari Lane" },
  });

  const gym = await prisma.gym.upsert({
    where: { slug: "pulse-district" },
    update: { name: "Pulse District", ownerId: owner.id, subscriptionStatus: "ACTIVE" },
    create: {
      name: "Pulse District",
      slug: "pulse-district",
      ownerId: owner.id,
      subscriptionStatus: "ACTIVE",
      branding: { tagline: "Move with the room", accent: "#3df0ff", logoText: "PD" },
    },
  });

  await ensureMembership(prisma, owner.id, gym.id, "OWNER");
  await ensureMembership(prisma, player.id, gym.id, "MEMBER");

  const plans = [
    { code: "free_demo", name: "Free demo", kind: "INDIVIDUAL" as const, listPriceInr: 0, seatMin: null, seatMax: null, description: "10 minutes of play. No paid features." },
    { code: "individual_pro", name: "Individual Pro", kind: "INDIVIDUAL" as const, listPriceInr: 999, seatMin: null, seatMax: null, description: "Game access for one person at home." },
    { code: "gym_starter", name: "Gym Starter", kind: "GYM" as const, listPriceInr: 19999, seatMin: 1, seatMax: 49, description: "Up to 49 member accounts." },
    { code: "gym_pro", name: "Gym Pro", kind: "GYM" as const, listPriceInr: 39999, seatMin: 51, seatMax: 99, description: "51 to 99 member accounts." },
  ];
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: { name: plan.name, listPriceInr: plan.listPriceInr, seatMin: plan.seatMin, seatMax: plan.seatMax, description: plan.description },
      create: plan,
    });
  }
  await prisma.seatAllocation.upsert({
    where: { gymId: gym.id },
    update: {},
    create: { gymId: gym.id, seatLimit: 49 },
  });

  await prisma.game.upsert({
    where: { slug: "fitrunner" },
    update: { enabled: true },
    create: {
      name: "FitRunner",
      slug: "fitrunner",
      description: "Three-lane arcade run. Lean to change lanes, jump the low barriers, and squat under the high ones.",
      enabled: true,
      configuration: { durationSeconds: 180, lives: 3, maxPlayers: 1 },
    },
  });

  const flags = [
    ["home_play", true, "Allow sessions that are not attached to a gym."],
    ["two_player", false, "Games are single player. One phone is the controller. The TV or laptop is the screen."],
    ["gym_branding", true, "Show gym name and colors in the TV lobby."],
    ["keyboard_fallback", true, "Show the labeled keyboard fallback on the TV."],
  ] as const;
  for (const [key, enabled, description] of flags) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: { description },
      create: { key, enabled, description },
    });
  }

  console.log(
    JSON.stringify({
      level: "info",
      message: "Seeded FitPlay demo data",
      admin: admin.email,
      owner: owner.email,
      player: player.email,
      gym: gym.slug,
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
