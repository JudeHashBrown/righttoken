import { z } from "zod";

export type RightTokenUserSnapshot = {
  externalUserId: string;
  email: string;
  displayName: string | null;
  registeredAt: Date;
  updatedAt: Date;
  registrationIp: string | null;
  countryCode: string | null;
  region: string | null;
  language: string | null;
  timezone: string | null;
  source: string | null;
  checkoutStartedAt: Date | null;
  firstPaidAt: Date | null;
  totalPaidMinor: number;
  successfulCallCount: number;
  lastCallAt: Date | null;
  balanceMinor: number;
  balanceCurrency?: string;
  balanceUsdMinor?: number;
  anomalyActive: boolean;
};

export const rightTokenUserSnapshotSchema = z.object({
  externalUserId: z.string().min(1).max(191),
  email: z.string().email().max(320),
  displayName: z.string().max(240).nullable(),
  registeredAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
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
  anomalyActive: z.boolean()
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
