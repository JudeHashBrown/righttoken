import type { TransactionClient } from "@/lib/db/transaction";
import {
  cancellableAutomationTaskStatuses
} from "@/modules/tasks/close-obsolete-tasks";

export async function cancelSupersededAutomationTasks(
  tx: TransactionClient,
  userId: string,
  ruleVersion: number,
  now: Date
): Promise<number> {
  const tasks = await tx.recallTask.findMany({
    where: {
      userId,
      origin: "AUTOMATION",
      status: { in: cancellableAutomationTaskStatuses },
      ruleVersion: { lt: ruleVersion }
    },
    select: { id: true }
  });
  if (tasks.length === 0) {
    return 0;
  }
  const taskIds = tasks.map((task) => task.id);
  await tx.recallTask.updateMany({
    where: {
      id: { in: taskIds },
      status: { in: cancellableAutomationTaskStatuses }
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      cancelReason: "segment_rule_republished"
    }
  });
  await tx.taskActivity.createMany({
    data: taskIds.map((taskId) => ({
      taskId,
      action: "task.auto_cancelled",
      detail: {
        reason: "segment_rule_republished",
        ruleVersion
      }
    }))
  });
  return taskIds.length;
}
