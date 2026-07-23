import type { PgBoss } from "pg-boss";
import { handleDailyDigest } from "@/worker/handlers/daily-digest";
import { handlePiiRetention } from "@/worker/handlers/pii-retention";
import {
  handleSegmentCheck,
  type SegmentCheckInput
} from "@/worker/handlers/segment-check";
import { handleSlaEscalation } from "@/worker/handlers/sla-escalation";
import { JOBS } from "@/worker/job-names";

export async function registerHandlers(
  boss: PgBoss
): Promise<void> {
  await boss.work<SegmentCheckInput>(
    JOBS.SEGMENT_CHECK,
    async ([job]) => {
      if (!job) {
        return { skipped: "empty_batch" };
      }
      return handleSegmentCheck(job.data);
    }
  );
  await boss.work(JOBS.SLA_ESCALATION, async () =>
    handleSlaEscalation()
  );
  await boss.work(JOBS.DAILY_DIGEST, async () =>
    handleDailyDigest()
  );
  await boss.work(JOBS.PII_RETENTION, async () =>
    handlePiiRetention()
  );
}
