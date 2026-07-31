import { z } from "zod";

export type RightTokenAnomalyDetail = {
  errorPhase: string | null;
  errorType: string | null;
  errorMessage: string | null;
  errorOwner: string | null;
  statusCode: number | null;
  model: string | null;
  platform: string | null;
  requestCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastOccurredAt: Date;
};

export type RightTokenUserSnapshot = {
  externalUserId: string;
  email: string;
  displayName: string | null;
  registeredAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  registrationIp: string | null;
  countryCode: string | null;
  region: string | null;
  language: string | null;
  timezone: string | null;
  source: string | null;
  checkoutStartedAt: Date | null;
  firstPaidAt: Date | null;
  totalPaidMinor: number;
  totalPaidCurrency?: "USD";
  firstCallAt?: Date | null;
  successfulCallCount: number;
  lastCallAt: Date | null;
  balanceMinor: number;
  balanceCurrency?: string;
  balanceUsdMinor?: number;
  anomalyActive: boolean;
  anomalyChangedAt: Date | null;
  anomalyDetail?: RightTokenAnomalyDetail | null;
};

const rightTokenAnomalyDetailSchema = z.object({
  errorPhase: z.string().trim().max(32).nullable(),
  errorType: z.string().trim().max(64).nullable(),
  errorMessage: z.string().trim().max(500).nullable(),
  errorOwner: z.string().trim().max(32).nullable(),
  statusCode: z.number().int().min(100).max(599).nullable(),
  model: z.string().trim().max(100).nullable(),
  platform: z.string().trim().max(32).nullable(),
  requestCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative(),
  lastOccurredAt: z.coerce.date()
});

export const rightTokenUserSnapshotSchema = z.object({
  externalUserId: z.string().min(1).max(191),
  email: z.string().email().max(320),
  displayName: z.string().max(240).nullable(),
  registeredAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().nullable().optional(),
  registrationIp: z.string().min(3).max(64).nullable(),
  countryCode: z
    .string()
    .length(2)
    .transform((value) => value.toUpperCase())
    .nullable(),
  region: z.string().max(160).nullable(),
  language: z.string().max(32).nullable(),
  timezone: z.string().max(80).nullable(),
  source: z.string().max(120).nullable(),
  checkoutStartedAt: z.coerce.date().nullable(),
  firstPaidAt: z.coerce.date().nullable(),
  totalPaidMinor: z.number().int().nonnegative(),
  totalPaidCurrency: z.literal("USD").optional(),
  firstCallAt: z.coerce.date().nullable().optional(),
  successfulCallCount: z.number().int().nonnegative(),
  lastCallAt: z.coerce.date().nullable(),
  balanceMinor: z.number().int(),
  balanceCurrency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .default("USD"),
  balanceUsdMinor: z.number().int().optional(),
  anomalyActive: z.boolean(),
  anomalyChangedAt: z.coerce.date().nullable(),
  anomalyDetail: rightTokenAnomalyDetailSchema.nullable().optional()
}).transform((snapshot) => ({
  ...snapshot,
  balanceUsdMinor:
    snapshot.balanceUsdMinor ?? snapshot.balanceMinor
}));

export interface RightTokenAdapter {
  listUsers(input: {
    updatedAfter?: Date;
    cursor?: string;
    limit: number;
  }): Promise<{
    users: RightTokenUserSnapshot[];
    nextCursor: string | null;
  }>;
  verifyConnection(): Promise<{
    ok: true;
    source: string;
  }>;
}
