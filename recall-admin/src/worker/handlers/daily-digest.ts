import { prisma } from "@/lib/db/prisma";
import { openTaskStatuses } from "@/modules/tasks/close-obsolete-tasks";

export async function handleDailyDigest() {
  const [open, overdue, urgent] = await Promise.all([
    prisma.recallTask.count({
      where: { status: { in: openTaskStatuses } }
    }),
    prisma.recallTask.count({
      where: {
        status: { in: openTaskStatuses },
        dueAt: { lt: new Date() }
      }
    }),
    prisma.recallTask.count({
      where: {
        status: { in: openTaskStatuses },
        priority: "URGENT"
      }
    })
  ]);
  return { open, overdue, urgent };
}
