-- Gym membership history and server-side workout attribution.
-- One ACTIVE player membership per user is a partial unique index, not a UI check.

CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'ENDED');

ALTER TABLE "GymMembership" ADD COLUMN "id" TEXT;
ALTER TABLE "GymMembership" ADD COLUMN "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "GymMembership" ADD COLUMN "assignedBy" TEXT;
ALTER TABLE "GymMembership" ADD COLUMN "assignedAt" TIMESTAMP(3);
ALTER TABLE "GymMembership" ADD COLUMN "endedAt" TIMESTAMP(3);

UPDATE "GymMembership"
SET "id" = gen_random_uuid()::text,
    "assignedAt" = "createdAt"
WHERE "id" IS NULL;

ALTER TABLE "GymMembership" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "GymMembership" ALTER COLUMN "assignedAt" SET NOT NULL;
ALTER TABLE "GymMembership" ALTER COLUMN "assignedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "GymMembership" DROP CONSTRAINT "GymMembership_pkey";
ALTER TABLE "GymMembership" ADD CONSTRAINT "GymMembership_pkey" PRIMARY KEY ("id");

ALTER TABLE "GymMembership" ADD CONSTRAINT "GymMembership_assignedBy_fkey"
  FOREIGN KEY ("assignedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "GymMembership_gymId_status_idx" ON "GymMembership"("gymId", "status");
CREATE INDEX "GymMembership_userId_status_idx" ON "GymMembership"("userId", "status");
CREATE INDEX "GymMembership_assignedBy_idx" ON "GymMembership"("assignedBy");

-- Half-open history rows may repeat a user and gym. Only one live player seat is allowed.
CREATE UNIQUE INDEX "GymMembership_one_active_player"
  ON "GymMembership" ("userId")
  WHERE "status" = 'ACTIVE' AND "role" = 'MEMBER';

ALTER TABLE "WorkoutSession" ADD COLUMN "gymIdAtSession" TEXT;
ALTER TABLE "WorkoutSession" ADD COLUMN "gameId" TEXT;

ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_gymIdAtSession_fkey"
  FOREIGN KEY ("gymIdAtSession") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkoutSession" ADD CONSTRAINT "WorkoutSession_gameId_fkey"
  FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkoutSession_gymIdAtSession_endedAt_idx" ON "WorkoutSession"("gymIdAtSession", "endedAt");
CREATE INDEX "WorkoutSession_gameId_idx" ON "WorkoutSession"("gameId");
