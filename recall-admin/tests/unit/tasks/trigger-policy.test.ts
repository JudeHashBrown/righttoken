import { describe, expect, it } from "vitest";
import {
  getNextTemporalBoundary,
  getTriggerPolicy
} from "@/modules/tasks/trigger-policy";
import { defaultSegmentConfig } from "@/modules/segmentation/rule-config";
import type { SegmentFacts } from "@/modules/segmentation/types";

const now = new Date("2026-07-23T12:00:00.000Z");
const baseFacts: SegmentFacts = {
  registeredAt: new Date("2026-07-23T10:00:00.000Z"),
  checkoutStartedAt: null,
  firstPaidAt: null,
  successfulCallCount: 0,
  lastCallAt: null,
  balanceMinor: 0,
  balanceChangedAt: null,
  anomalyActive: false,
  anomalyChangedAt: null
};

describe("default recall trigger policy", () => {
  it.each([
    ["A", 2 * 60, "NORMAL"],
    ["B", 30, "IMPORTANT"],
    ["C", 24 * 60, "IMPORTANT"],
    ["D", 0, "NORMAL"],
    ["E", 3 * 24 * 60, "NORMAL"],
    ["F", 0, "URGENT"]
  ] as const)(
    "%s has the approved delay and priority",
    (segment, delayMinutes, priority) => {
      expect(getTriggerPolicy(segment)).toMatchObject({
        enabled: true,
        delayMinutes,
        priority
      });
    }
  );

  it("does not create personal recall tasks for G", () => {
    expect(getTriggerPolicy("G").enabled).toBe(false);
  });
});

describe("next temporal segment boundary", () => {
  it("checks A exactly two hours after registration", () => {
    expect(
      getNextTemporalBoundary(baseFacts, now, defaultSegmentConfig)
    ).toEqual({
      runAt: new Date("2026-07-23T12:00:00.000Z"),
      expectedSegment: "A",
      expectedFactTimestamp: "2026-07-23T10:00:00.000Z",
      reasonKey: "registration_unpaid"
    });
  });

  it("uses the approved B, C, and E observation windows", () => {
    expect(
      getNextTemporalBoundary(
        {
          ...baseFacts,
          checkoutStartedAt: new Date("2026-07-23T11:45:00.000Z")
        },
        now,
        defaultSegmentConfig
      )?.runAt
    ).toEqual(new Date("2026-07-23T12:15:00.000Z"));

    expect(
      getNextTemporalBoundary(
        {
          ...baseFacts,
          firstPaidAt: new Date("2026-07-23T11:00:00.000Z")
        },
        now,
        defaultSegmentConfig
      )?.runAt
    ).toEqual(new Date("2026-07-24T11:00:00.000Z"));

    expect(
      getNextTemporalBoundary(
        {
          ...baseFacts,
          firstPaidAt: new Date("2026-07-20T10:00:00.000Z"),
          successfulCallCount: 2,
          lastCallAt: now,
          balanceChangedAt: new Date("2026-07-23T09:00:00.000Z")
        },
        now,
        defaultSegmentConfig
      )
    ).toMatchObject({
      runAt: new Date("2026-07-26T09:00:00.000Z"),
      expectedSegment: "E",
      reasonKey: "balance_exhausted"
    });
  });

  it("checks an active anomaly immediately", () => {
    expect(
      getNextTemporalBoundary(
        {
          ...baseFacts,
          anomalyActive: true,
          anomalyChangedAt: new Date("2026-07-23T11:59:00.000Z")
        },
        now,
        defaultSegmentConfig
      )
    ).toEqual({
      runAt: now,
      expectedSegment: "F",
      expectedFactTimestamp: "2026-07-23T11:59:00.000Z",
      reasonKey: "active_anomaly"
    });
  });

  it("reschedules active G at lastCallAt plus the inactivity window", () => {
    expect(
      getNextTemporalBoundary(
        {
          ...baseFacts,
          firstPaidAt: new Date("2026-07-20T10:00:00.000Z"),
          successfulCallCount: 5,
          lastCallAt: new Date("2026-07-23T11:00:00.000Z"),
          balanceMinor: 5_000
        },
        now,
        defaultSegmentConfig
      )
    ).toEqual({
      runAt: new Date("2026-07-30T11:00:00.000Z"),
      expectedSegment: "G",
      expectedFactTimestamp: "2026-07-23T11:00:00.000Z",
      reasonKey: "inactivity_boundary"
    });
  });
});
