import type {
  SegmentCode,
  TaskStatus
} from "@/generated/prisma/client";
import type { TransactionClient } from "@/lib/db/transaction";

export const openTaskStatuses: TaskStatus[] = [
  "UNASSIGNED",
  "TODO",
  "IN_PROGRESS",
  "WAITING_USER",
  "PAUSED"
];

export const cancellableAutomationTaskStatuses: TaskStatus[] = [
  "UNASSIGNED",
  "TODO"
];

export async function closeObsoleteAutomationTasks(
  tx: TransactionClient,
  userId: string,
  oldSegment: SegmentCode,
  now: Date
): Promise<number> {
  const tasks = await tx.recallTask.findMany({
    where: {
      userId,
      origin: "AUTOMATION",
      status: { in: cancellableAutomationTaskStatuses },
      triggerKey: { startsWith: `${oldSegment}:` }
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
      cancelReason: "segment_changed"
    }
  });
  await tx.taskActivity.createMany({
    data: taskIds.map((taskId) => ({
      taskId,
      action: "task.auto_cancelled",
      detail: {
        reason: "segment_changed",
        oldSegment
      }
    }))
  });
  return taskIds.length;
}
