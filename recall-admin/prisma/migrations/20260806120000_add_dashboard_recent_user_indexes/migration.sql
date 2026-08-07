CREATE INDEX "UserProfile_recent_unpaid_idx"
ON "recall"."UserProfile"("currentSegment", "sourceDeletedAt", "registeredAt");

CREATE INDEX "UserProfile_recent_anomaly_occurred_idx"
ON "recall"."UserProfile"(
  "currentSegment",
  "anomalyActive",
  "sourceDeletedAt",
  "anomalyLastOccurredAt"
);

CREATE INDEX "UserProfile_recent_anomaly_changed_idx"
ON "recall"."UserProfile"(
  "currentSegment",
  "anomalyActive",
  "sourceDeletedAt",
  "anomalyChangedAt"
);
