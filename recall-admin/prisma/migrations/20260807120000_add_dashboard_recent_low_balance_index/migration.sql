CREATE INDEX "UserProfile_recent_low_balance_idx"
ON "recall"."UserProfile"(
  "currentSegment",
  "sourceDeletedAt",
  "lastCallAt"
);
