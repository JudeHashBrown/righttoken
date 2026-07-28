CREATE TABLE "AssignmentRecalculationRun" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "status" "RecalculationStatus" NOT NULL DEFAULT 'PENDING',
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "processedUsers" INTEGER NOT NULL DEFAULT 0,
    "succeededUsers" INTEGER NOT NULL DEFAULT 0,
    "failedUsers" INTEGER NOT NULL DEFAULT 0,
    "ownerChanges" INTEGER NOT NULL DEFAULT 0,
    "reassignedTasks" INTEGER NOT NULL DEFAULT 0,
    "lastProcessedUserId" TEXT,
    "upperBoundUserId" TEXT,
    "errorSummary" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentRecalculationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AssignmentRecalculationRun_status_createdAt_idx"
ON "AssignmentRecalculationRun"("status", "createdAt");

CREATE INDEX "AssignmentRecalculationRun_requestedById_createdAt_idx"
ON "AssignmentRecalculationRun"("requestedById", "createdAt");

ALTER TABLE "AssignmentRecalculationRun"
ADD CONSTRAINT "AssignmentRecalculationRun_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "Member"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
