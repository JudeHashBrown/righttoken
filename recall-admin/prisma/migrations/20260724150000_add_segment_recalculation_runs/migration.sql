CREATE TYPE "RecalculationStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'PARTIAL_FAILURE',
  'FAILED'
);

CREATE TABLE "SegmentRecalculationRun" (
  "id" TEXT NOT NULL,
  "ruleVersionId" TEXT NOT NULL,
  "ruleVersionNumber" INTEGER NOT NULL,
  "requestedById" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "RecalculationStatus" NOT NULL DEFAULT 'PENDING',
  "totalUsers" INTEGER NOT NULL DEFAULT 0,
  "processedUsers" INTEGER NOT NULL DEFAULT 0,
  "succeededUsers" INTEGER NOT NULL DEFAULT 0,
  "failedUsers" INTEGER NOT NULL DEFAULT 0,
  "segmentChanges" INTEGER NOT NULL DEFAULT 0,
  "cancelledTasks" INTEGER NOT NULL DEFAULT 0,
  "createdTasks" INTEGER NOT NULL DEFAULT 0,
  "lastProcessedUserId" TEXT,
  "previewSummary" JSONB NOT NULL,
  "errorSummary" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SegmentRecalculationRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SegmentRecalculationRun_ruleVersionId_key"
  ON "SegmentRecalculationRun"("ruleVersionId");
CREATE UNIQUE INDEX "SegmentRecalculationRun_idempotencyKey_key"
  ON "SegmentRecalculationRun"("idempotencyKey");
CREATE INDEX "SegmentRecalculationRun_status_createdAt_idx"
  ON "SegmentRecalculationRun"("status", "createdAt");

ALTER TABLE "SegmentRecalculationRun"
  ADD CONSTRAINT "SegmentRecalculationRun_ruleVersionId_fkey"
  FOREIGN KEY ("ruleVersionId")
  REFERENCES "AutomationRuleVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SegmentRecalculationRun"
  ADD CONSTRAINT "SegmentRecalculationRun_requestedById_fkey"
  FOREIGN KEY ("requestedById")
  REFERENCES "Member"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
