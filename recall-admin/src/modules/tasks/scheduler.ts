import type { SegmentCode } from "@/modules/segmentation/types";

export type SegmentCheckSchedule = {
  userId: string;
  expectedSegment: SegmentCode;
  expectedFactTimestamp: string;
  runAt: Date;
  reasonKey: string;
};

export interface TaskScheduler {
  scheduleSegmentCheck(input: SegmentCheckSchedule): Promise<void>;
}

export const noopTaskScheduler: TaskScheduler = {
  async scheduleSegmentCheck() {}
};
