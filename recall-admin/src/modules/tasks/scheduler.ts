import type { SegmentCode } from "@/modules/segmentation/types";

export type LegacySegmentCheckSchedule = {
  userId: string;
  expectedSegment: SegmentCode;
  expectedFactTimestamp: string;
  runAt: Date;
  reasonKey: string;
};

export type StructuredSegmentCheckSchedule = {
  userId: string;
  ruleVersion: number;
  runAt: Date;
  boundaryKey: string;
  purpose: "TASK" | "RULE";
  expectedSegment?: SegmentCode;
};

export type SegmentCheckSchedule =
  | LegacySegmentCheckSchedule
  | StructuredSegmentCheckSchedule;

export interface TaskScheduler {
  scheduleSegmentCheck(input: SegmentCheckSchedule): Promise<void>;
  scheduleSegmentRecalculation?(
    input: { runId: string }
  ): Promise<void>;
  scheduleLocationRecalculation?(
    input: { runId: string }
  ): Promise<void>;
  scheduleAssignmentRecalculation?(
    input: { runId: string }
  ): Promise<void>;
  scheduleMailBatch?(
    input: { batchId: string }
  ): Promise<void>;
}

export const noopTaskScheduler: TaskScheduler = {
  async scheduleSegmentCheck() {}
};
