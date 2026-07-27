CREATE SCHEMA IF NOT EXISTS "recall";

-- Prisma may run this migration in either of two states:
-- 1. an existing installation whose enum types still live in public; or
-- 2. a fresh installation whose search_path already created them in recall.
-- PostgreSQL has no `ALTER TYPE IF EXISTS`, so guard every move explicitly.
DO $$
BEGIN
  IF to_regtype('public."MemberRole"') IS NOT NULL
     AND to_regtype('recall."MemberRole"') IS NULL THEN
    ALTER TYPE "public"."MemberRole" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."SegmentCode"') IS NOT NULL
     AND to_regtype('recall."SegmentCode"') IS NULL THEN
    ALTER TYPE "public"."SegmentCode" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."TaskPriority"') IS NOT NULL
     AND to_regtype('recall."TaskPriority"') IS NULL THEN
    ALTER TYPE "public"."TaskPriority" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."TaskStatus"') IS NOT NULL
     AND to_regtype('recall."TaskStatus"') IS NULL THEN
    ALTER TYPE "public"."TaskStatus" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."TaskOrigin"') IS NOT NULL
     AND to_regtype('recall."TaskOrigin"') IS NULL THEN
    ALTER TYPE "public"."TaskOrigin" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."MailDirection"') IS NOT NULL
     AND to_regtype('recall."MailDirection"') IS NULL THEN
    ALTER TYPE "public"."MailDirection" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."MailMessageStatus"') IS NOT NULL
     AND to_regtype('recall."MailMessageStatus"') IS NULL THEN
    ALTER TYPE "public"."MailMessageStatus" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."NotificationChannel"') IS NOT NULL
     AND to_regtype('recall."NotificationChannel"') IS NULL THEN
    ALTER TYPE "public"."NotificationChannel" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."DeliveryStatus"') IS NOT NULL
     AND to_regtype('recall."DeliveryStatus"') IS NULL THEN
    ALTER TYPE "public"."DeliveryStatus" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."RecalculationStatus"') IS NOT NULL
     AND to_regtype('recall."RecalculationStatus"') IS NULL THEN
    ALTER TYPE "public"."RecalculationStatus" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."LocationAttributionSource"') IS NOT NULL
     AND to_regtype('recall."LocationAttributionSource"') IS NULL THEN
    ALTER TYPE "public"."LocationAttributionSource" SET SCHEMA "recall";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regtype('public."LocationRuleMatchType"') IS NOT NULL
     AND to_regtype('recall."LocationRuleMatchType"') IS NULL THEN
    ALTER TYPE "public"."LocationRuleMatchType" SET SCHEMA "recall";
  END IF;
END $$;

ALTER TABLE IF EXISTS "public"."Member" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."SsoTicketRedemption" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."Session" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."UserProfile" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."UserEvent" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."SegmentHistory" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."SegmentOverride" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."UserNote" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."AutomationRuleVersion" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."SegmentRecalculationRun" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."AssignmentRule" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."AssignmentRecalculationRun" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."LocationAttributionRule" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."LocationRecalculationRun" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."RecallTask" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."TaskActivity" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."AuditLog" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."LoginAttempt" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."Invitation" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."RecoveryCode" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."Mailbox" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."MailTemplate" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."MailThread" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."MailMessage" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."SuppressionEntry" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."NotificationIntent" SET SCHEMA "recall";
ALTER TABLE IF EXISTS "public"."IntegrationCredential" SET SCHEMA "recall";

ALTER TABLE "recall"."UserProfile"
  ADD COLUMN IF NOT EXISTS "sourceDeletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "UserProfile_sourceDeletedAt_idx"
  ON "recall"."UserProfile"("sourceDeletedAt");
