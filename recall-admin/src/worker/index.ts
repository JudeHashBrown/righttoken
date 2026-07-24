import { pathToFileURL } from "node:url";
import type { PgBoss } from "pg-boss";
import { parseServerEnv } from "@/lib/env/server";
import { createBoss, ensureQueues } from "@/worker/boss";
import { JOBS } from "@/worker/job-names";
import { registerHandlers } from "@/worker/register-handlers";

let activeBoss: PgBoss | null = null;

export async function startWorker(): Promise<PgBoss> {
  if (activeBoss) {
    return activeBoss;
  }
  const env = parseServerEnv(process.env);
  const boss = createBoss(env.JOB_DATABASE_URL);
  await boss.start();
  await ensureQueues(boss);
  await registerHandlers(boss);

  await boss.schedule(
    JOBS.SLA_ESCALATION,
    "*/5 * * * *",
    null,
    {
      key: "sla-escalation-five-minutes",
      tz: "Asia/Shanghai"
    }
  );
  await boss.schedule(JOBS.DAILY_DIGEST, "0 10 * * *", null, {
    key: "daily-digest-10am-shanghai",
    tz: "Asia/Shanghai"
  });
  await boss.schedule(JOBS.PII_RETENTION, "0 3 * * *", null, {
    key: "pii-retention-3am-shanghai",
    tz: "Asia/Shanghai"
  });
  await boss.schedule(JOBS.MAIL_SYNC, "*/2 * * * *", null, {
    key: "mail-sync-two-minutes",
    tz: "Asia/Shanghai"
  });
  await boss.schedule(
    JOBS.NOTIFICATION_DELIVERY,
    "* * * * *",
    null,
    {
      key: "notification-delivery-every-minute",
      tz: "Asia/Shanghai"
    }
  );
  await boss.schedule(
    JOBS.USER_RECONCILIATION,
    "*/15 * * * *",
    { mode: "incremental" },
    {
      key: "righttoken-incremental-fifteen-minutes",
      tz: "Asia/Shanghai"
    }
  );
  await boss.schedule(
    JOBS.USER_RECONCILIATION,
    "0 2 * * *",
    { mode: "full" },
    {
      key: "righttoken-full-2am-shanghai",
      tz: "Asia/Shanghai"
    }
  );

  activeBoss = boss;
  return boss;
}

export async function stopWorker(): Promise<void> {
  const boss = activeBoss;
  activeBoss = null;
  if (boss) {
    await boss.stop({ graceful: true, timeout: 30_000 });
  }
}

async function shutdown(): Promise<void> {
  try {
    await stopWorker();
    process.exitCode = 0;
  } catch (error) {
    console.error("worker shutdown failed", error);
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (entrypoint === import.meta.url) {
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  startWorker().catch((error) => {
    console.error("worker startup failed", error);
    process.exitCode = 1;
  });
}
