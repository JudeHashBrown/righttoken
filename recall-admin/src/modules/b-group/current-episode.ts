import type { SegmentCode } from "@/generated/prisma/client";
import type { BGroupProgress } from "@/modules/b-group/types";

export function currentSegmentEpisodeStartedAt(input: {
  currentSegment: SegmentCode;
  registeredAt: Date;
  segmentHistory: Array<{
    toSegment: SegmentCode;
    changedAt: Date;
  }>;
}): Date {
  const latestEntry = input.segmentHistory
    .filter((entry) => entry.toSegment === input.currentSegment)
    .sort(
      (left, right) =>
        right.changedAt.getTime() - left.changedAt.getTime()
    )[0];
  return latestEntry?.changedAt ?? input.registeredAt;
}

export function deriveBGroupProgress(input: {
  episodeStartedAt: Date;
  sentMailDates: Date[];
  maintenanceDates: Date[];
  hasContact: boolean;
  couponSucceeded: boolean;
}): BGroupProgress {
  const inCurrentEpisode = (value: Date) =>
    value.getTime() >= input.episodeStartedAt.getTime();
  return {
    mailComplete: input.sentMailDates.some(inCurrentEpisode),
    contactComplete: input.hasContact,
    couponComplete: input.couponSucceeded,
    maintenanceComplete:
      input.maintenanceDates.some(inCurrentEpisode)
  };
}
