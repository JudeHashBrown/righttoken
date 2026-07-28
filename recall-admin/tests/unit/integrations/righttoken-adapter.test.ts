import { describe, expect, it } from "vitest";

import { rightTokenUserSnapshotSchema } from "@/modules/integrations/righttoken/adapter";

describe("RightToken user snapshot contract", () => {
  it("parses the strict anomaly transition timestamp", () => {
    const anomalyChangedAt = "2026-07-28T15:53:00.000Z";
    const snapshot = rightTokenUserSnapshotSchema.parse({
      externalUserId: "159",
      email: "user@example.test",
      displayName: null,
      registeredAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-28T15:53:00.000Z",
      registrationIp: null,
      countryCode: null,
      region: null,
      language: null,
      timezone: null,
      source: null,
      checkoutStartedAt: null,
      firstPaidAt: null,
      totalPaidMinor: 0,
      successfulCallCount: 18_019,
      lastCallAt: "2026-07-28T15:50:00.000Z",
      balanceMinor: 132_846,
      anomalyActive: true,
      anomalyChangedAt
    });

    expect(snapshot.anomalyActive).toBe(true);
    expect(snapshot.anomalyChangedAt).toEqual(new Date(anomalyChangedAt));
  });

  it("accepts a null anomaly transition for healthy users", () => {
    const snapshot = rightTokenUserSnapshotSchema.parse({
      externalUserId: "healthy",
      email: "healthy@example.test",
      displayName: null,
      registeredAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-28T15:53:00.000Z",
      registrationIp: null,
      countryCode: null,
      region: null,
      language: null,
      timezone: null,
      source: null,
      checkoutStartedAt: null,
      firstPaidAt: null,
      totalPaidMinor: 0,
      successfulCallCount: 0,
      lastCallAt: null,
      balanceMinor: 0,
      anomalyActive: false,
      anomalyChangedAt: null
    });

    expect(snapshot.anomalyChangedAt).toBeNull();
  });
});
