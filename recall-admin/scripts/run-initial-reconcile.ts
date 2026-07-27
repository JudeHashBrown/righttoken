import { pathToFileURL } from "node:url";
import { parseServerEnv } from "@/lib/env/server";
import { prisma } from "@/lib/db/prisma";
import { getConfiguredRightTokenAdapter } from "@/modules/integrations/righttoken/runtime-adapter";
import { reconcileRightTokenUsers } from "@/modules/integrations/righttoken/reconcile";
import { buildInitialReconcileSummary } from "@/modules/integrations/righttoken/initial-reconcile";
import { PgTaskScheduler } from "@/modules/tasks/pg-task-scheduler";
import { createBoss, ensureQueues } from "@/worker/boss";

export async function runInitialReconcile(): Promise<void> {
  const env = parseServerEnv(process.env);
  const adapter = await getConfiguredRightTokenAdapter();
  if (!adapter) {
    throw new Error("RightToken source is not configured");
  }
  const connection = await adapter.verifyConnection();
  if (!connection.ok) {
    throw new Error("RightToken source connection failed");
  }

  const boss = createBoss(env.JOB_DATABASE_URL);
  await boss.start();
  try {
    await ensureQueues(boss);
    const before = await prisma.userProfile.count();
    const result = await reconcileRightTokenUsers({
      adapter,
      scheduler: new PgTaskScheduler(boss),
      pageSize: 200,
      maxPages: 10_000,
      now: new Date()
    });
    const after = await prisma.userProfile.count();
    const summary = buildInitialReconcileSummary(
      result,
      before,
      after
    );
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    if (!summary.complete) {
      throw new Error(
        "Initial reconciliation stopped before the final cursor"
      );
    }
  } finally {
    await boss.stop({ graceful: true, timeout: 30_000 });
    await prisma.$disconnect();
  }
}

const entrypoint = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (entrypoint === import.meta.url) {
  runInitialReconcile().catch((error) => {
    const message =
      error instanceof Error
        ? error.message
        : "Initial reconciliation failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
