DROP INDEX "SegmentRecalculationRun_ruleVersionId_key";

CREATE INDEX "SegmentRecalculationRun_ruleVersionId_createdAt_idx"
  ON "SegmentRecalculationRun"("ruleVersionId", "createdAt");
