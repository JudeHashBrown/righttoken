import type { RightTokenDatabaseQuery } from "@/modules/integrations/righttoken/database-adapter";
import { getRightTokenUserSnapshotsByIds } from "@/modules/integrations/righttoken/database-adapter";

export type RightTokenUserFacts = {
  externalUserId: string;
  email: string;
  displayName: string | null;
  registeredAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  registrationIp: string | null;
  checkoutStartedAt: Date | null;
  firstPaidAt: Date | null;
  totalPaidMinor: number;
  firstCallAt: Date | null;
  successfulCallCount: number;
  lastCallAt: Date | null;
  balanceMinor: number;
  balanceCurrency: string;
  balanceUsdMinor: number;
  anomalyActive: boolean;
};

export async function getRightTokenUserFactsByIds(
  externalUserIds: string[],
  query?: RightTokenDatabaseQuery
): Promise<Map<string, RightTokenUserFacts>> {
  if (externalUserIds.length === 0) {
    return new Map();
  }
  const snapshots = [];
  for (let offset = 0; offset < externalUserIds.length; offset += 1_000) {
    snapshots.push(
      ...(await getRightTokenUserSnapshotsByIds(
        externalUserIds.slice(offset, offset + 1_000),
        query
      ))
    );
  }
  return new Map(
    snapshots.map((snapshot) => [
      snapshot.externalUserId,
      {
        externalUserId: snapshot.externalUserId,
        email: snapshot.email,
        displayName: snapshot.displayName,
        registeredAt: snapshot.registeredAt,
        updatedAt: snapshot.updatedAt,
        deletedAt: snapshot.deletedAt ?? null,
        registrationIp: snapshot.registrationIp,
        checkoutStartedAt: snapshot.checkoutStartedAt,
        firstPaidAt: snapshot.firstPaidAt,
        totalPaidMinor: snapshot.totalPaidMinor,
        firstCallAt:
          snapshot.firstCallAt ??
          (snapshot.successfulCallCount > 0
            ? snapshot.lastCallAt
            : null),
        successfulCallCount: snapshot.successfulCallCount,
        lastCallAt: snapshot.lastCallAt,
        balanceMinor: snapshot.balanceMinor,
        balanceCurrency: snapshot.balanceCurrency ?? "USD",
        balanceUsdMinor:
          snapshot.balanceUsdMinor ?? snapshot.balanceMinor,
        anomalyActive: snapshot.anomalyActive
      }
    ])
  );
}

export async function getProductionRightTokenUserFactsByIds(
  externalUserIds: string[]
): Promise<Map<string, RightTokenUserFacts>> {
  if (process.env.RIGHTTOKEN_SOURCE_MODE !== "database") {
    return new Map();
  }
  return getRightTokenUserFactsByIds(externalUserIds);
}
