import type { TransactionClient } from "@/lib/db/transaction";
import { openTaskStatuses } from "@/modules/tasks/close-obsolete-tasks";

export async function transferOpenUserTasks(
  tx: TransactionClient,
  input: {
    userId: string;
    actorId: string;
    ownerId: string;
    reason: string;
    now: Date;
    source?: "user_owner_change" | "user_location_change";
  }
): Promise<number> {
  const tasks = await tx.recallTask.findMany({
    where: {
      userId: input.userId,
      status: { in: openTaskStatuses }
    },
    select: { id: true, assigneeId: true }
  });
  if (tasks.length === 0) {
    return 0;
  }

  const taskIds = tasks.map((task) => task.id);
  await tx.recallTask.updateMany({
    where: { id: { in: taskIds } },
    data: { assigneeId: input.ownerId }
  });
  await tx.taskActivity.createMany({
    data: tasks.map((task) => ({
      taskId: task.id,
      actorId: input.actorId,
      action: "task.transferred",
      detail: {
        fromAssigneeId: task.assigneeId,
        toAssigneeId: input.ownerId,
        reason: input.reason,
        source: input.source ?? "user_owner_change",
        transferredAt: input.now.toISOString()
      }
    }))
  });
  return tasks.length;
}
