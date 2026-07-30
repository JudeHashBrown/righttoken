CREATE TYPE "recall"."OwnerAssignmentMode" AS ENUM ('AUTO', 'MANUAL');

ALTER TABLE "recall"."UserProfile"
ADD COLUMN "ownerAssignmentMode" "recall"."OwnerAssignmentMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN "ownerAssignedAt" TIMESTAMP(3),
ADD COLUMN "ownerAssignedById" TEXT,
ADD COLUMN "ownerAssignmentReason" TEXT;

UPDATE "recall"."UserProfile"
SET "ownerAssignedAt" = COALESCE("updatedAt", "createdAt")
WHERE "ownerId" IS NOT NULL;

CREATE INDEX "UserProfile_ownerAssignmentMode_ownerId_idx"
ON "recall"."UserProfile"("ownerAssignmentMode", "ownerId");

ALTER TABLE "recall"."UserProfile"
ADD CONSTRAINT "UserProfile_ownerAssignedById_fkey"
FOREIGN KEY ("ownerAssignedById")
REFERENCES "recall"."Member"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
