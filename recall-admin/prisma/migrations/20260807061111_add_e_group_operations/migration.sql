-- DropIndex
DROP INDEX "recall"."NotificationIntent_taskId_channel_idx";

-- DropIndex
DROP INDEX "recall"."UserProfile_recent_low_balance_idx";

-- AlterTable
ALTER TABLE "recall"."MailTemplate" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "recall"."SegmentRecalculationRun" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "recall"."RechargeOutreachRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT,
    "body" TEXT NOT NULL,
    "assetId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RechargeOutreachRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recall"."PersonalizedCarePlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalizedCarePlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RechargeOutreachRecord_userId_occurredAt_idx" ON "recall"."RechargeOutreachRecord"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "RechargeOutreachRecord_assetId_idx" ON "recall"."RechargeOutreachRecord"("assetId");

-- CreateIndex
CREATE INDEX "PersonalizedCarePlan_userId_createdAt_idx" ON "recall"."PersonalizedCarePlan"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "recall"."RechargeOutreachRecord" ADD CONSTRAINT "RechargeOutreachRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "recall"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall"."RechargeOutreachRecord" ADD CONSTRAINT "RechargeOutreachRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "recall"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall"."RechargeOutreachRecord" ADD CONSTRAINT "RechargeOutreachRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "recall"."MailAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall"."PersonalizedCarePlan" ADD CONSTRAINT "PersonalizedCarePlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "recall"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall"."PersonalizedCarePlan" ADD CONSTRAINT "PersonalizedCarePlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "recall"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "recall"."MailDeliveryEvent_inboundProviderMessageId_recipientNormalized_" RENAME TO "MailDeliveryEvent_inboundProviderMessageId_recipientNormali_key";
