-- AlterEnum
ALTER TYPE "recall"."MailPurpose" ADD VALUE 'USAGE_FOLLOW_UP';

-- DropIndex
DROP INDEX IF EXISTS "recall"."UserProfile_recent_low_balance_idx";

-- CreateTable
CREATE TABLE "recall"."InactivityReasonRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InactivityReasonRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recall"."UserGuidanceRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGuidanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InactivityReasonRecord_userId_createdAt_idx" ON "recall"."InactivityReasonRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserGuidanceRecord_userId_createdAt_idx" ON "recall"."UserGuidanceRecord"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "recall"."InactivityReasonRecord" ADD CONSTRAINT "InactivityReasonRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "recall"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall"."InactivityReasonRecord" ADD CONSTRAINT "InactivityReasonRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "recall"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall"."UserGuidanceRecord" ADD CONSTRAINT "UserGuidanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "recall"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall"."UserGuidanceRecord" ADD CONSTRAINT "UserGuidanceRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "recall"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
