export const JOBS = {
  SEGMENT_CHECK: "segment-check",
  SLA_ESCALATION: "sla-escalation",
  DAILY_DIGEST: "daily-digest",
  PII_RETENTION: "pii-retention",
  MAIL_SYNC: "mail-sync",
  USER_RECONCILIATION: "user-reconciliation",
  NOTIFICATION_DELIVERY: "notification-delivery",
  MAIL_BATCH: "mail-batch",
  SEGMENT_RECALCULATION: "segment-recalculation",
  LOCATION_RECALCULATION: "location-recalculation",
  ASSIGNMENT_RECALCULATION: "assignment-recalculation"
} as const;

export type JobName = (typeof JOBS)[keyof typeof JOBS];
