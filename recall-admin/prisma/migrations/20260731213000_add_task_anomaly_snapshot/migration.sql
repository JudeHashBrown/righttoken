ALTER TABLE "recall"."RecallTask"
ADD COLUMN "anomalySnapshot" JSONB;

UPDATE "recall"."RecallTask" AS task
SET "anomalySnapshot" = jsonb_build_object(
  'anomalyErrorPhase', profile."anomalyErrorPhase",
  'anomalyErrorType', profile."anomalyErrorType",
  'anomalyErrorMessage', profile."anomalyErrorMessage",
  'anomalyErrorOwner', profile."anomalyErrorOwner",
  'anomalyStatusCode', profile."anomalyStatusCode",
  'anomalyModel', profile."anomalyModel",
  'anomalyPlatform', profile."anomalyPlatform",
  'anomalyRequestCount', profile."anomalyRequestCount",
  'anomalyFailureCount', profile."anomalyFailureCount",
  'anomalyConsecutiveFailures', profile."anomalyConsecutiveFailures",
  'anomalyLastOccurredAt', profile."anomalyLastOccurredAt"
)
FROM "recall"."UserProfile" AS profile
WHERE task."userId" = profile."id"
  AND profile."anomalyActive" = TRUE
  AND (
    task."triggerKey" LIKE 'F:%'
    OR task."triggerKey" LIKE '%service-anomaly%'
    OR task."title" LIKE '%服务异常%'
  );
