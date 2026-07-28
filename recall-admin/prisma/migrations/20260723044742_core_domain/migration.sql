-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('PRIMARY_ADMIN', 'ADMIN', 'OPERATOR');

-- CreateEnum
CREATE TYPE "SegmentCode" AS ENUM ('A', 'B', 'C', 'D', 'E', 'F', 'G');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('URGENT', 'IMPORTANT', 'NORMAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('UNASSIGNED', 'TODO', 'IN_PROGRESS', 'WAITING_USER', 'COMPLETED', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('AUTOMATION', 'MANUAL', 'EMAIL_REPLY');

-- CreateTable
CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "twoFactorSecret" TEXT,
    "twoFactorOn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reauthenticatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "displayName" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL,
    "registrationIpEnc" TEXT,
    "registrationIpHash" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "language" TEXT,
    "timezone" TEXT,
    "source" TEXT,
    "checkoutStartedAt" TIMESTAMP(3),
    "paymentStatus" TEXT NOT NULL DEFAULT 'NONE',
    "firstPaidAt" TIMESTAMP(3),
    "totalPaidMinor" INTEGER NOT NULL DEFAULT 0,
    "firstCallAt" TIMESTAMP(3),
    "lastCallAt" TIMESTAMP(3),
    "successfulCallCount" INTEGER NOT NULL DEFAULT 0,
    "balanceMinor" INTEGER NOT NULL DEFAULT 0,
    "balanceChangedAt" TIMESTAMP(3),
    "anomalyActive" BOOLEAN NOT NULL DEFAULT false,
    "currentSegment" "SegmentCode" NOT NULL,
    "segmentRuleVersion" INTEGER NOT NULL DEFAULT 1,
    "ownerId" TEXT,
    "reasonLabel" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "lastExternalEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,

    CONSTRAINT "UserEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromSegment" "SegmentCode",
    "toSegment" "SegmentCode" NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "segment" "SegmentCode" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRuleVersion" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecallTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "origin" "TaskOrigin" NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" "TaskPriority" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "assigneeId" TEXT,
    "assignmentReason" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecallTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskActivity" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_memberId_expiresAt_idx" ON "Session"("memberId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_externalUserId_key" ON "UserProfile"("externalUserId");

-- CreateIndex
CREATE INDEX "UserProfile_currentSegment_updatedAt_idx" ON "UserProfile"("currentSegment", "updatedAt");

-- CreateIndex
CREATE INDEX "UserProfile_countryCode_region_idx" ON "UserProfile"("countryCode", "region");

-- CreateIndex
CREATE INDEX "UserProfile_emailNormalized_idx" ON "UserProfile"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "UserEvent_eventId_key" ON "UserEvent"("eventId");

-- CreateIndex
CREATE INDEX "UserEvent_userId_occurredAt_idx" ON "UserEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "SegmentHistory_userId_changedAt_idx" ON "SegmentHistory"("userId", "changedAt");

-- CreateIndex
CREATE INDEX "SegmentOverride_userId_expiresAt_idx" ON "SegmentOverride"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "UserNote_userId_createdAt_idx" ON "UserNote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationRuleVersion_kind_active_idx" ON "AutomationRuleVersion"("kind", "active");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationRuleVersion_kind_version_key" ON "AutomationRuleVersion"("kind", "version");

-- CreateIndex
CREATE INDEX "RecallTask_status_priority_dueAt_idx" ON "RecallTask"("status", "priority", "dueAt");

-- CreateIndex
CREATE INDEX "RecallTask_assigneeId_status_idx" ON "RecallTask"("assigneeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecallTask_userId_triggerKey_ruleVersion_key" ON "RecallTask"("userId", "triggerKey", "ruleVersion");

-- CreateIndex
CREATE INDEX "TaskActivity_taskId_createdAt_idx" ON "TaskActivity"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEvent" ADD CONSTRAINT "UserEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentHistory" ADD CONSTRAINT "SegmentHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentOverride" ADD CONSTRAINT "SegmentOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNote" ADD CONSTRAINT "UserNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallTask" ADD CONSTRAINT "RecallTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecallTask" ADD CONSTRAINT "RecallTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "RecallTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
