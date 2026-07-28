import type { PgBoss } from "pg-boss";
import type {
  SegmentCheckSchedule,
  TaskScheduler
} from "@/modules/tasks/scheduler";
import { JOBS } from "@/worker/job-names";

export class PgTaskScheduler implements TaskScheduler {
  constructor(private readonly boss: PgBoss) {}

  async scheduleSegmentCheck(
    input: SegmentCheckSchedule
  ): Promise<void> {
    const singletonKey =
      "ruleVersion" in input
        ? `${input.userId}:${input.ruleVersion}:${input.boundaryKey}`
        : `${input.userId}:${input.reasonKey}:` +
          input.expectedFactTimestamp;
    await this.boss.upsert(JOBS.SEGMENT_CHECK, input, {
      startAfter: input.runAt,
      singletonKey
    });
  }

  async scheduleSegmentRecalculation(
    input: { runId: string }
  ): Promise<void> {
    await this.boss.upsert(
      JOBS.SEGMENT_RECALCULATION,
      input,
      { singletonKey: input.runId }
    );
  }

  async scheduleLocationRecalculation(
    input: { runId: string }
  ): Promise<void> {
    await this.boss.upsert(
      JOBS.LOCATION_RECALCULATION,
      input,
      { singletonKey: input.runId }
    );
  }

  async scheduleAssignmentRecalculation(
    input: { runId: string }
  ): Promise<void> {
    await this.boss.upsert(
      JOBS.ASSIGNMENT_RECALCULATION,
      input,
      { singletonKey: input.runId }
    );
  }
}
