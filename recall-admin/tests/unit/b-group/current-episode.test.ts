import { describe, expect, it } from "vitest";
import {
  currentSegmentEpisodeStartedAt,
  deriveBGroupProgress
} from "@/modules/b-group/current-episode";

describe("current B-group episode", () => {
  it("uses the latest transition into the current segment", () => {
    expect(
      currentSegmentEpisodeStartedAt({
        currentSegment: "B",
        registeredAt: new Date("2026-08-01T00:00:00Z"),
        segmentHistory: [
          {
            toSegment: "B",
            changedAt: new Date("2026-08-01T12:00:00Z")
          },
          {
            toSegment: "C",
            changedAt: new Date("2026-08-02T00:00:00Z")
          },
          {
            toSegment: "B",
            changedAt: new Date("2026-08-03T00:00:00Z")
          }
        ]
      })
    ).toEqual(new Date("2026-08-03T00:00:00Z"));
  });

  it("falls back to registration for users without history", () => {
    const registeredAt = new Date("2026-08-01T00:00:00Z");
    expect(
      currentSegmentEpisodeStartedAt({
        currentSegment: "B",
        registeredAt,
        segmentHistory: []
      })
    ).toEqual(registeredAt);
  });

  it("keeps permanent contact and coupon completion across episodes", () => {
    const episodeStartedAt = new Date("2026-08-03T00:00:00Z");
    expect(
      deriveBGroupProgress({
        episodeStartedAt,
        sentMailDates: [new Date("2026-08-03T01:00:00Z")],
        maintenanceDates: [new Date("2026-08-02T01:00:00Z")],
        hasContact: true,
        couponSucceeded: true
      })
    ).toEqual({
      mailComplete: true,
      contactComplete: true,
      couponComplete: true,
      maintenanceComplete: false
    });
  });
});
