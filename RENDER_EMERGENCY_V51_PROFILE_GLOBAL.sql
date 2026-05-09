ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "profilePicture" VARCHAR(255);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "profileImage" VARCHAR(255);
UPDATE "Users" SET "profilePicture" = "profileImage" WHERE "profilePicture" IS NULL AND "profileImage" IS NOT NULL;
UPDATE "Users" SET "profileImage" = "profilePicture" WHERE "profileImage" IS NULL AND "profilePicture" IS NOT NULL;
