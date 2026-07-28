ALTER TABLE "recall"."MailTemplate"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;

DROP INDEX IF EXISTS "recall"."MailTemplate_active_segment_locale_idx";

CREATE INDEX "MailTemplate_active_archivedAt_segment_locale_idx"
  ON "recall"."MailTemplate"("active", "archivedAt", "segment", "locale");
