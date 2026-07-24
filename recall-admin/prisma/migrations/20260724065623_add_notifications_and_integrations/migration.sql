-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'WECOM', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "NotificationIntent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationCredential" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "encryptedConfig" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastTestedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationIntent_status_nextAttemptAt_createdAt_idx" ON "NotificationIntent"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationIntent_recipient_readAt_createdAt_idx" ON "NotificationIntent"("recipient", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationIntent_taskId_channel_idx" ON "NotificationIntent"("taskId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCredential_kind_key" ON "IntegrationCredential"("kind");

-- AddForeignKey
ALTER TABLE "NotificationIntent" ADD CONSTRAINT "NotificationIntent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "RecallTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
