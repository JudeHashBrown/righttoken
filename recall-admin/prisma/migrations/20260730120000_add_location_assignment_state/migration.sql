CREATE TYPE "recall"."LocationAssignmentMode" AS ENUM ('AUTO', 'MANUAL');

ALTER TABLE "recall"."UserProfile"
ADD COLUMN "locationAssignmentMode" "recall"."LocationAssignmentMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN "locationAssignedAt" TIMESTAMP(3),
ADD COLUMN "locationAssignedById" TEXT,
ADD COLUMN "locationAssignmentReason" TEXT;

CREATE INDEX "UserProfile_locationAssignmentMode_countryCode_region_idx"
ON "recall"."UserProfile"("locationAssignmentMode", "countryCode", "region");

ALTER TABLE "recall"."UserProfile"
ADD CONSTRAINT "UserProfile_locationAssignedById_fkey"
FOREIGN KEY ("locationAssignedById")
REFERENCES "recall"."Member"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
