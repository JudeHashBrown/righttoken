export type SegmentCode = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export type SegmentFacts = {
  registeredAt: Date;
  source?: string | null;
  countryCode?: string | null;
  checkoutStartedAt: Date | null;
  paymentStatus?: string;
  firstPaidAt: Date | null;
  totalPaidMinor?: number;
  successfulCallCount: number;
  firstCallAt?: Date | null;
  lastCallAt: Date | null;
  balanceMinor: number;
  balanceUsdMinor?: number;
  balanceChangedAt: Date | null;
  anomalyActive: boolean;
  anomalyChangedAt: Date | null;
  unsubscribedAt?: Date | null;
  pausedAt?: Date | null;
  externalUserId?: string;
  email?: string;
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
