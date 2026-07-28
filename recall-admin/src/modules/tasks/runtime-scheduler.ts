import type { TaskScheduler } from "@/modules/tasks/scheduler";
import { PgTaskScheduler } from "@/modules/tasks/pg-task-scheduler";
import { createBoss, ensureQueues } from "@/worker/boss";

const globalForScheduler = globalThis as unknown as {
  recallRuntimeScheduler?: Promise<TaskScheduler>;
};

async function createRuntimeTaskScheduler(): Promise<TaskScheduler> {
  const boss = createBoss();
  await boss.start();
  await ensureQueues(boss);
  return new PgTaskScheduler(boss);
}

export async function getRuntimeTaskScheduler(): Promise<TaskScheduler> {
  globalForScheduler.recallRuntimeScheduler ??=
    createRuntimeTaskScheduler().catch((error) => {
      globalForScheduler.recallRuntimeScheduler = undefined;
      throw error;
    });
  return globalForScheduler.recallRuntimeScheduler;
}
