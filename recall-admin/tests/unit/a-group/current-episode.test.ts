import { describe, expect, it } from "vitest";
import {
  currentSegmentEpisodeStartedAt,
  deriveAGroupProgress
} from "@/modules/a-group/current-episode";

describe("current A-group episode", () => {
  it("uses the latest transition into A", () => {
    expect(
      currentSegmentEpisodeStartedAt({
        currentSegment: "A",
        registeredAt: new Date("2026-08-01T00:00:00Z"),
        segmentHistory: [
          {
            toSegment: "A",
            changedAt: new Date("2026-08-01T12:00:00Z")
          },
          {
            toSegment: "B",
            changedAt: new Date("2026-08-02T00:00:00Z")
          },
          {
            toSegment: "A",
            changedAt: new Date("2026-08-03T00:00:00Z")
          }
        ]
      })
    ).toEqual(new Date("2026-08-03T00:00:00Z"));
  });

  it("falls back to registration for a new A user", () => {
    const registeredAt = new Date("2026-08-01T00:00:00Z");
    expect(
      currentSegmentEpisodeStartedAt({
        currentSegment: "A",
        registeredAt,
        segmentHistory: []
      })
    ).toEqual(registeredAt);
  });

  it("resets mail and maintenance while keeping contact and coupon", () => {
    const episodeStartedAt = new Date("2026-08-03T00:00:00Z");
    expect(
      deriveAGroupProgress({
        episodeStartedAt,
        sentMailDates: [new Date("2026-08-02T01:00:00Z")],
        maintenanceDates: [new Date("2026-08-02T02:00:00Z")],
        hasContact: true,
        couponSucceeded: true
      })
    ).toEqual({
      mailComplete: false,
      contactComplete: true,
      couponComplete: true,
      maintenanceComplete: false
    });
  });
});
