import { describe, expect, it, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { PgTaskScheduler } from "@/modules/tasks/pg-task-scheduler";
import { JOBS } from "@/worker/job-names";

describe("PgTaskScheduler mail batches", () => {
  it("persists the requested next bulk-mail run time", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const scheduler = new PgTaskScheduler(
      { upsert } as unknown as PgBoss
    );
    const runAt = new Date("2026-08-03T12:03:00.000Z");

    await scheduler.scheduleMailBatch({
      batchId: "batch-1",
      runAt
    });

    expect(upsert).toHaveBeenCalledWith(
      JOBS.MAIL_BATCH,
      { batchId: "batch-1", runAt },
      { singletonKey: "batch-1", startAfter: runAt }
    );
  });
});
