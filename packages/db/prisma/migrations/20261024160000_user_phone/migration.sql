-- Contact phone for admin subscription lookup. Not unique: two people may share a number, and the admin chooses which one.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
CREATE INDEX "User_phone_idx" ON "User"("phone");
