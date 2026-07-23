export const rightTokenEventTypes = [
  "user.registered",
  "checkout.started",
  "checkout.cancelled",
  "checkout.expired",
  "payment.failed",
  "payment.succeeded",
  "balance.changed",
  "api_call.succeeded",
  "service.anomaly",
  "service.recovered",
  "complaint.created",
  "refund.requested",
  "user.profile_updated"
] as const;

export type RightTokenEventType =
  (typeof rightTokenEventTypes)[number];
