ALTER TYPE "recall"."MailMessageStatus" ADD VALUE 'BOUNCED' AFTER 'SENT';
ALTER TYPE "recall"."MailBatchRecipientStatus" ADD VALUE 'BOUNCED' AFTER 'SENT';

CREATE TYPE "recall"."MailDeliveryAction" AS ENUM (
  'FAILED',
  'DELAYED',
  'DELIVERED',
  'OTHER'
);

ALTER TABLE "recall"."MailMessage"
  ADD COLUMN "bouncedAt" TIMESTAMP(3),
  ADD COLUMN "bounceStatusCode" TEXT,
  ADD COLUMN "bounceDiagnostic" TEXT;

ALTER TABLE "recall"."MailBatch"
  ADD COLUMN "retryRootBatchId" TEXT;

ALTER TABLE "recall"."MailBatchRecipient"
  ADD COLUMN "retryOfRecipientId" TEXT,
  ADD COLUMN "bouncedAt" TIMESTAMP(3),
  ADD COLUMN "bounceStatusCode" TEXT,
  ADD COLUMN "bounceDiagnostic" TEXT;

CREATE TABLE "recall"."MailDeliveryEvent" (
  "id" TEXT NOT NULL,
  "mailboxId" TEXT NOT NULL,
  "outboundMessageId" TEXT NOT NULL,
  "inboundProviderMessageId" TEXT NOT NULL,
  "action" "recall"."MailDeliveryAction" NOT NULL,
  "recipientNormalized" TEXT NOT NULL,
  "statusCode" TEXT,
  "diagnosticCode" TEXT,
  "reportedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MailDeliveryEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MailDeliveryEvent_inboundProviderMessageId_recipientNormalized_action_key"
ON "recall"."MailDeliveryEvent"("inboundProviderMessageId", "recipientNormalized", "action");

CREATE INDEX "MailDeliveryEvent_mailboxId_reportedAt_idx"
ON "recall"."MailDeliveryEvent"("mailboxId", "reportedAt");

CREATE INDEX "MailDeliveryEvent_outboundMessageId_reportedAt_idx"
ON "recall"."MailDeliveryEvent"("outboundMessageId", "reportedAt");

CREATE UNIQUE INDEX "MailBatchRecipient_retryOfRecipientId_key"
ON "recall"."MailBatchRecipient"("retryOfRecipientId");

CREATE INDEX "MailBatch_retryRootBatchId_createdAt_idx"
ON "recall"."MailBatch"("retryRootBatchId", "createdAt");

CREATE INDEX "MailBatchRecipient_retryOfRecipientId_idx"
ON "recall"."MailBatchRecipient"("retryOfRecipientId");

ALTER TABLE "recall"."MailDeliveryEvent"
ADD CONSTRAINT "MailDeliveryEvent_mailboxId_fkey"
FOREIGN KEY ("mailboxId") REFERENCES "recall"."Mailbox"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recall"."MailDeliveryEvent"
ADD CONSTRAINT "MailDeliveryEvent_outboundMessageId_fkey"
FOREIGN KEY ("outboundMessageId") REFERENCES "recall"."MailMessage"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recall"."MailBatch"
ADD CONSTRAINT "MailBatch_retryRootBatchId_fkey"
FOREIGN KEY ("retryRootBatchId") REFERENCES "recall"."MailBatch"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recall"."MailBatchRecipient"
ADD CONSTRAINT "MailBatchRecipient_retryOfRecipientId_fkey"
FOREIGN KEY ("retryOfRecipientId") REFERENCES "recall"."MailBatchRecipient"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
