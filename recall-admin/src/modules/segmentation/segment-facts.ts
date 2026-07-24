export type SegmentEvaluationFacts = {
  now: Date;
  registeredAt: Date;
  registrationElapsed: number;
  source: string | null;
  registrationIp: string | null;
  countryCode: string | null;
  checkoutStarted: boolean;
  paymentStatus: string;
  firstPaidAt: Date | null;
  totalPaidMinor: number;
  successfulCallCount: number;
  firstCallAt: Date | null;
  lastCallAt: Date | null;
  lastCallElapsed: number | null;
  balanceUsdMinor: number;
  balanceChangedAt: Date | null;
  emptyBalanceElapsed: number | null;
  anomalyActive: boolean;
  anomalyChangedAt: Date | null;
  unsubscribed: boolean;
  paused: boolean;
  externalUserId: string;
  emailDomain: string;
};

export type SegmentFactSource = {
  id?: string;
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

function elapsedMinutes(source: Date | null, now: Date): number | null {
  if (!source) {
    return null;
  }
  return Math.max(
    0,
    Math.floor((now.getTime() - source.getTime()) / 60_000)
  );
}

function emailDomain(email: string | undefined): string {
  if (!email) {
    return "";
  }
  return email.split("@").at(-1)?.trim().toLowerCase() ?? "";
}

export function buildSegmentFacts(
  source: SegmentFactSource,
  now: Date,
  registrationIp: string | null = null
): SegmentEvaluationFacts {
  const balanceUsdMinor =
    source.balanceUsdMinor ?? source.balanceMinor;
  return {
    now,
    registeredAt: source.registeredAt,
    registrationElapsed:
      elapsedMinutes(source.registeredAt, now) ?? 0,
    source: source.source ?? null,
    registrationIp,
    countryCode: source.countryCode?.toUpperCase() ?? null,
    checkoutStarted: source.checkoutStartedAt !== null,
    paymentStatus:
      source.paymentStatus ??
      (source.firstPaidAt ? "PAID" : "NONE"),
    firstPaidAt: source.firstPaidAt,
    totalPaidMinor: source.totalPaidMinor ?? 0,
    successfulCallCount: source.successfulCallCount,
    firstCallAt: source.firstCallAt ?? null,
    lastCallAt: source.lastCallAt,
    lastCallElapsed: elapsedMinutes(source.lastCallAt, now),
    balanceUsdMinor,
    balanceChangedAt: source.balanceChangedAt,
    emptyBalanceElapsed:
      balanceUsdMinor < 50
        ? elapsedMinutes(source.balanceChangedAt, now)
        : null,
    anomalyActive: source.anomalyActive,
    anomalyChangedAt: source.anomalyChangedAt,
    unsubscribed: Boolean(source.unsubscribedAt),
    paused: Boolean(source.pausedAt),
    externalUserId: source.externalUserId ?? "",
    emailDomain: emailDomain(source.email)
  };
}
