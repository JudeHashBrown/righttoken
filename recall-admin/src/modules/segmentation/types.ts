export type SegmentCode = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export type SegmentFacts = {
  registeredAt: Date;
  checkoutStartedAt: Date | null;
  firstPaidAt: Date | null;
  successfulCallCount: number;
  lastCallAt: Date | null;
  balanceMinor: number;
  balanceChangedAt: Date | null;
  anomalyActive: boolean;
  anomalyChangedAt: Date | null;
};

export type SegmentConfig = {
  emptyBalanceMinor: number;
  inactiveMs: number;
  registrationUnpaidMs?: number;
  checkoutUnpaidMs?: number;
  paidWithoutCallMs?: number;
  emptyBalanceReminderMs?: number;
};

export type SegmentDecision = {
  segment: SegmentCode;
  reason: string;
};
