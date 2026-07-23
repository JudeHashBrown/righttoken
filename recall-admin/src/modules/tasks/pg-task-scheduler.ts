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
    await this.boss.upsert(JOBS.SEGMENT_CHECK, input, {
      startAfter: input.runAt,
      singletonKey:
        `${input.userId}:${input.reasonKey}:` +
        input.expectedFactTimestamp
    });
  }
}
