import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PgBoss } from "pg-boss";
import { PgTaskScheduler } from "@/modules/tasks/pg-task-scheduler";
import { createBoss, ensureQueues } from "@/worker/boss";
import { JOBS } from "@/worker/job-names";

describe("durable job singleton keys", () => {
  let boss: PgBoss;

  beforeAll(async () => {
    boss = createBoss();
    await boss.start();
    await ensureQueues(boss);
  });

  afterAll(async () => {
    await boss.stop({ graceful: true, timeout: 5_000 });
  });

  it("stores one future job for the same user fact boundary", async () => {
    const scheduler = new PgTaskScheduler(boss);
    const input = {
      userId: `job-user-${randomUUID()}`,
      expectedSegment: "A" as const,
      expectedFactTimestamp: "2026-07-23T08:00:00.000Z",
      runAt: new Date(Date.now() + 60 * 60 * 1000),
      reasonKey: "registration_unpaid"
    };

    await scheduler.scheduleSegmentCheck(input);
    await scheduler.scheduleSegmentCheck(input);

    const jobs = await boss.findJobs(JOBS.SEGMENT_CHECK, {
      queued: true
    });
    const singletonKey =
      `${input.userId}:${input.reasonKey}:` +
      input.expectedFactTimestamp;
    const matching = jobs.filter(
      (job) => job.singletonKey === singletonKey
    );
    expect(matching).toHaveLength(1);

    if (matching[0]) {
      await boss.deleteJob(JOBS.SEGMENT_CHECK, matching[0].id);
    }
  });
});
