import { describe, expect, it } from "vitest";
import { classifyUser } from "@/modules/segmentation/classify-user";
import { defaultSegmentConfig } from "@/modules/segmentation/rule-config";
import type { SegmentFacts } from "@/modules/segmentation/types";

const now = new Date("2026-07-23T12:00:00.000Z");
const base: SegmentFacts = {
  registeredAt: new Date("2026-07-20T00:00:00.000Z"),
  checkoutStartedAt: null,
  firstPaidAt: null,
  successfulCallCount: 0,
  lastCallAt: null,
  balanceMinor: 0,
  balanceChangedAt: null,
  anomalyActive: false,
  anomalyChangedAt: null
};

describe("A–G segmentation", () => {
  it.each([
    [{ ...base }, "A"],
    [
      {
        ...base,
        checkoutStartedAt: new Date("2026-07-23T10:00:00Z")
      },
      "B"
    ],
    [
      {
        ...base,
        firstPaidAt: new Date("2026-07-22T10:00:00Z")
      },
      "C"
    ],
    [
      {
        ...base,
        firstPaidAt: now,
        successfulCallCount: 2,
        lastCallAt: new Date("2026-07-10T00:00:00Z"),
        balanceMinor: 500
      },
      "D"
    ],
    [
      {
        ...base,
        firstPaidAt: now,
        successfulCallCount: 2,
        lastCallAt: now,
        balanceMinor: 0
      },
      "E"
    ],
    [{ ...base, anomalyActive: true }, "F"],
    [
      {
        ...base,
        firstPaidAt: now,
        successfulCallCount: 2,
        lastCallAt: now,
        balanceMinor: 500
      },
      "G"
    ]
  ] as const)(
    "classifies the approved facts as segment %s",
    (facts, expected) => {
      expect(
        classifyUser(facts, now, defaultSegmentConfig).segment
      ).toBe(expected);
    }
  );

  it("always gives an active service anomaly precedence", () => {
    const healthyPaidUser: SegmentFacts = {
      ...base,
      firstPaidAt: now,
      successfulCallCount: 10,
      lastCallAt: now,
      balanceMinor: 10_000,
      anomalyActive: true
    };

    expect(
      classifyUser(healthyPaidUser, now, defaultSegmentConfig)
    ).toEqual({
      segment: "F",
      reason: "active service anomaly"
    });
  });
});
