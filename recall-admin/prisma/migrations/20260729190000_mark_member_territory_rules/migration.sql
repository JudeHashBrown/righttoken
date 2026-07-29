ALTER TABLE "recall"."AssignmentRule"
ADD COLUMN "memberTerritoryManaged" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "AssignmentRule_memberTerritoryManaged_assigneeId_idx"
ON "recall"."AssignmentRule"("memberTerritoryManaged", "assigneeId");
