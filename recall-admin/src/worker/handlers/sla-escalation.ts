import { prisma } from "@/lib/db/prisma";
import { openTaskStatuses } from "@/modules/tasks/close-obsolete-tasks";

export async function handleSlaEscalation(
  now = new Date()
): Promise<{ intentsCreated: number }> {
  const tasks = await prisma.recallTask.findMany({
    where: {
      status: { in: openTaskStatuses },
      dueAt: { lte: now }
    },
    select: { id: true }
  });
  let intentsCreated = 0;
  for (const task of tasks) {
    const existing = await prisma.taskActivity.findFirst({
      where: {
        taskId: task.id,
        action: "notification.intent.sla",
        createdAt: {
          gte: new Date(now.getTime() - 5 * 60 * 1000)
        }
      },
      select: { id: true }
    });
    if (!existing) {
      await prisma.taskActivity.create({
        data: {
          taskId: task.id,
          action: "notification.intent.sla",
          detail: { dueAtOrBefore: now.toISOString() }
        }
      });
      intentsCreated += 1;
    }
  }
  return { intentsCreated };
}
