CREATE TYPE "recall"."MailAudienceMode"
  AS ENUM ('USER', 'SEGMENT', 'ALL');

CREATE TYPE "recall"."MailBatchStatus"
  AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'PARTIAL_FAILURE',
    'FAILED'
  );

CREATE TYPE "recall"."MailBatchRecipientStatus"
  AS ENUM ('PENDING', 'SENDING', 'SENT', 'SKIPPED', 'FAILED');

CREATE TABLE "recall"."MailBatch" (
  "id" TEXT NOT NULL,
  "mailboxId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "audienceMode" "recall"."MailAudienceMode" NOT NULL,
  "segment" "recall"."SegmentCode",
  "subject" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "recall"."MailBatchStatus" NOT NULL DEFAULT 'PENDING',
  "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  "pendingRecipients" INTEGER NOT NULL DEFAULT 0,
  "sentRecipients" INTEGER NOT NULL DEFAULT 0,
  "skippedRecipients" INTEGER NOT NULL DEFAULT 0,
  "failedRecipients" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MailBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recall"."MailBatchRecipient" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "status" "recall"."MailBatchRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "reasonCode" TEXT,
  "messageId" TEXT,
  "taskId" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "claimedAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MailBatchRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recall"."MailBatchAsset" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "disposition" "recall"."MailAssetDisposition" NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "MailBatchAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailBatch_idempotencyKey_key"
  ON "recall"."MailBatch"("idempotencyKey");
CREATE INDEX "MailBatch_createdById_createdAt_idx"
  ON "recall"."MailBatch"("createdById", "createdAt");
CREATE INDEX "MailBatch_status_createdAt_idx"
  ON "recall"."MailBatch"("status", "createdAt");

CREATE UNIQUE INDEX "MailBatchRecipient_messageId_key"
  ON "recall"."MailBatchRecipient"("messageId");
CREATE UNIQUE INDEX "MailBatchRecipient_batchId_userId_key"
  ON "recall"."MailBatchRecipient"("batchId", "userId");
CREATE INDEX "MailBatchRecipient_batchId_status_id_idx"
  ON "recall"."MailBatchRecipient"("batchId", "status", "id");

CREATE UNIQUE INDEX "MailBatchAsset_batchId_assetId_key"
  ON "recall"."MailBatchAsset"("batchId", "assetId");
CREATE INDEX "MailBatchAsset_assetId_idx"
  ON "recall"."MailBatchAsset"("assetId");
CREATE INDEX "MailBatchAsset_batchId_sortOrder_idx"
  ON "recall"."MailBatchAsset"("batchId", "sortOrder");

ALTER TABLE "recall"."MailBatch"
  ADD CONSTRAINT "MailBatch_mailboxId_fkey"
  FOREIGN KEY ("mailboxId") REFERENCES "recall"."Mailbox"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recall"."MailBatch"
  ADD CONSTRAINT "MailBatch_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "recall"."Member"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recall"."MailBatchRecipient"
  ADD CONSTRAINT "MailBatchRecipient_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "recall"."MailBatch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recall"."MailBatchRecipient"
  ADD CONSTRAINT "MailBatchRecipient_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "recall"."UserProfile"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recall"."MailBatchRecipient"
  ADD CONSTRAINT "MailBatchRecipient_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "recall"."MailMessage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recall"."MailBatchRecipient"
  ADD CONSTRAINT "MailBatchRecipient_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "recall"."RecallTask"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "recall"."MailBatchAsset"
  ADD CONSTRAINT "MailBatchAsset_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "recall"."MailBatch"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recall"."MailBatchAsset"
  ADD CONSTRAINT "MailBatchAsset_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "recall"."MailAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
