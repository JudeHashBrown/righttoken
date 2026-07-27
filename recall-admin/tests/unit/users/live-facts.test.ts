import { describe, expect, it } from "vitest";

import {
  mergeManagedUser,
  type RightTokenUserFacts
} from "@/modules/users/managed-user";

const liveFacts: RightTokenUserFacts = {
  externalUserId: "42",
  email: "live@example.com",
  displayName: "Live user",
  registeredAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-27T00:00:00.000Z"),
  registrationIp: "203.0.113.42",
  checkoutStartedAt: new Date("2026-07-02T00:00:00.000Z"),
  firstPaidAt: new Date("2026-07-03T00:00:00.000Z"),
  totalPaidMinor: 1_200,
  firstCallAt: new Date("2026-07-04T00:00:00.000Z"),
  successfulCallCount: 8,
  lastCallAt: new Date("2026-07-26T00:00:00.000Z"),
  balanceMinor: 350,
  balanceCurrency: "USD",
  balanceUsdMinor: 350,
  anomalyActive: false
};

describe("managed users with live RightToken facts", () => {
  it("uses live source facts instead of stale persisted values", () => {
    const merged = mergeManagedUser(
      {
        id: "recall-state-42",
        externalUserId: "42",
        currentSegment: "D",
        email: "stale@example.com",
        displayName: "Stale user",
        registeredAt: new Date("2026-01-01T00:00:00.000Z"),
        checkoutStartedAt: null,
        paymentStatus: "NONE",
        firstPaidAt: null,
        totalPaidMinor: 0,
        firstCallAt: null,
        successfulCallCount: 0,
        lastCallAt: null,
        balanceMinor: 0,
        balanceCurrency: "USD",
        balanceUsdMinor: 0,
        anomalyActive: true,
        updatedAt: new Date("2026-01-01T00:00:00.000Z")
      },
      liveFacts
    );

    expect(merged).toMatchObject({
      id: "recall-state-42",
      currentSegment: "D",
      email: "live@example.com",
      totalPaidMinor: 1_200,
      successfulCallCount: 8,
      balanceMinor: 350,
      anomalyActive: false,
      registrationIp: "203.0.113.42"
    });
    expect(merged.updatedAt).toEqual(liveFacts.updatedAt);
  });

  it("creates a deterministic default operational state for a new main user", () => {
    const merged = mergeManagedUser(null, liveFacts);

    expect(merged.id).toBe("righttoken:42");
    expect(merged.currentSegment).toBe("A");
    expect(merged.externalUserId).toBe("42");
  });
});
