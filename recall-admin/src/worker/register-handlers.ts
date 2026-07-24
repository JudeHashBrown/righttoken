import type { PgBoss } from "pg-boss";
import { handleDailyDigest } from "@/worker/handlers/daily-digest";
import { handlePiiRetention } from "@/worker/handlers/pii-retention";
import { handleMailSync } from "@/worker/handlers/mail-sync";
import { handleNotificationDelivery } from "@/worker/handlers/notification-delivery";
import { handleUserReconciliation } from "@/worker/handlers/user-reconciliation";
import { PgTaskScheduler } from "@/modules/tasks/pg-task-scheduler";
import {
  handleSegmentCheck,
  type SegmentCheckInput
} from "@/worker/handlers/segment-check";
import { handleSlaEscalation } from "@/worker/handlers/sla-escalation";
import { JOBS } from "@/worker/job-names";

export async function registerHandlers(
  boss: PgBoss
): Promise<void> {
  const taskScheduler = new PgTaskScheduler(boss);
  await boss.work<SegmentCheckInput>(
    JOBS.SEGMENT_CHECK,
    async ([job]) => {
      if (!job) {
        return { skipped: "empty_batch" };
      }
      return handleSegmentCheck(
        job.data,
        new Date(),
        taskScheduler
      );
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
  await boss.work(JOBS.MAIL_SYNC, async () => handleMailSync());
  await boss.work(JOBS.NOTIFICATION_DELIVERY, async () =>
    handleNotificationDelivery()
  );
  await boss.work(JOBS.USER_RECONCILIATION, async ([job]) =>
    handleUserReconciliation(
      job?.data ?? { mode: "incremental" },
      undefined,
      taskScheduler
    )
  );
}
