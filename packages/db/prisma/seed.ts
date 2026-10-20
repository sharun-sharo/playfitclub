import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

  await prisma.gymMembership.upsert({
    where: { userId_gymId: { userId: owner.id, gymId: gym.id } },
    update: { role: "OWNER" },
    create: { userId: owner.id, gymId: gym.id, role: "OWNER" },
  });
  await prisma.gymMembership.upsert({
    where: { userId_gymId: { userId: player.id, gymId: gym.id } },
    update: { role: "MEMBER" },
    create: { userId: player.id, gymId: gym.id, role: "MEMBER" },
  });

  await prisma.game.upsert({
    where: { slug: "fitrunner" },
    update: { enabled: true },
    create: {
      name: "FitRunner",
      slug: "fitrunner",
      description: "Three-lane arcade run. Lean to change lanes, jump the low barriers, and squat under the high ones.",
      enabled: true,
      configuration: { durationSeconds: 180, lives: 3, maxPlayers: 2 },
    },
  });

  const flags = [
    ["home_play", true, "Allow sessions that are not attached to a gym."],
    ["two_player", true, "Allow two phones to compete on one TV."],
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
