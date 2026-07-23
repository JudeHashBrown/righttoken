export const JOBS = {
  SEGMENT_CHECK: "segment-check",
  SLA_ESCALATION: "sla-escalation",
  DAILY_DIGEST: "daily-digest",
  PII_RETENTION: "pii-retention",
  MAIL_SYNC: "mail-sync",
  USER_RECONCILIATION: "user-reconciliation"
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
