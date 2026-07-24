-- CreateEnum
CREATE TYPE "MailDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "MailMessageStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'FAILED', 'UNMATCHED');

-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trackingDisclosure" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastTestedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "segment" "SegmentCode",
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "threadId" TEXT,
    "userId" TEXT,
    "taskId" TEXT,
    "direction" "MailDirection" NOT NULL,
    "status" "MailMessageStatus" NOT NULL,
    "providerMessageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT[],
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT[],
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "templateKey" TEXT,
    "templateVersion" INTEGER,
    "reviewedById" TEXT,
    "openedAt" TIMESTAMP(3),
    "firstClickedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_emailAddress_key" ON "Mailbox"("emailAddress");

-- CreateIndex
CREATE INDEX "MailTemplate_active_segment_locale_idx" ON "MailTemplate"("active", "segment", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "MailTemplate_key_version_key" ON "MailTemplate"("key", "version");

-- CreateIndex
CREATE INDEX "MailThread_userId_updatedAt_idx" ON "MailThread"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "MailThread_mailboxId_updatedAt_idx" ON "MailThread"("mailboxId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_providerMessageId_key" ON "MailMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "MailMessage_mailboxId_status_createdAt_idx" ON "MailMessage"("mailboxId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MailMessage_threadId_createdAt_idx" ON "MailMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "MailMessage_userId_createdAt_idx" ON "MailMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MailMessage_taskId_idx" ON "MailMessage"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_emailNormalized_key" ON "SuppressionEntry"("emailNormalized");

-- AddForeignKey
ALTER TABLE "MailThread" ADD CONSTRAINT "MailThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailThread" ADD CONSTRAINT "MailThread_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MailThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "RecallTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
