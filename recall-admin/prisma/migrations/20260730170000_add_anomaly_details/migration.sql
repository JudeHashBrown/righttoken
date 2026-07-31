ALTER TABLE "recall"."UserProfile"
ADD COLUMN "anomalyErrorPhase" TEXT,
ADD COLUMN "anomalyErrorType" TEXT,
ADD COLUMN "anomalyErrorOwner" TEXT,
ADD COLUMN "anomalyStatusCode" INTEGER,
ADD COLUMN "anomalyModel" TEXT,
ADD COLUMN "anomalyPlatform" TEXT,
ADD COLUMN "anomalyRequestCount" INTEGER,
ADD COLUMN "anomalyFailureCount" INTEGER,
ADD COLUMN "anomalyConsecutiveFailures" INTEGER,
ADD COLUMN "anomalyLastOccurredAt" TIMESTAMP(3);
