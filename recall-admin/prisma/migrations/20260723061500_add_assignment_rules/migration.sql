CREATE TABLE "AssignmentRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,
    "assigneeId" TEXT,
    "fallbackAssigneeId" TEXT,
    "poolKey" TEXT,
    "workloadLimit" INTEGER,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AssignmentRule_priority_key"
ON "AssignmentRule"("priority");

CREATE INDEX "AssignmentRule_enabled_priority_idx"
ON "AssignmentRule"("enabled", "priority");
