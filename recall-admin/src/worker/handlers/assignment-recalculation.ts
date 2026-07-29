import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  assignTask,
  assignUserOwner
} from "@/modules/assignment/assign-task";
import {
  noopTaskScheduler,
  type TaskScheduler
} from "@/modules/tasks/scheduler";

const inputSchema = z.object({
  runId: z.string().min(1)
});

export type AssignmentRecalculationInput = z.input<
  typeof inputSchema
>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export async function handleAssignmentRecalculation(
  rawInput: AssignmentRecalculationInput,
  now = new Date(),
  scheduler: TaskScheduler = noopTaskScheduler,
  batchSize = 200
) {
  const { runId } = inputSchema.parse(rawInput);
  const run =
    await prisma.assignmentRecalculationRun.findUniqueOrThrow({
      where: { id: runId }
    });
  if (run.status === "COMPLETED") {
    return {
      completed: true as const,
      processedUsers: run.processedUsers,
      failedUsers: run.failedUsers
    };
  }
  await prisma.assignmentRecalculationRun.update({
    where: { id: run.id },
    data: {
      status: "RUNNING",
      startedAt: run.startedAt ?? now,
      completedAt: null
    }
  });

  const users = run.upperBoundUserId
    ? await prisma.userProfile.findMany({
        where: {
          sourceDeletedAt: null,
          ownerAssignmentMode: "AUTO",
          id: {
            ...(run.lastProcessedUserId
              ? { gt: run.lastProcessedUserId }
              : {}),
            lte: run.upperBoundUserId
          }
        },
        orderBy: { id: "asc" },
        take: batchSize,
        select: {
          id: true,
          ownerId: true,
          ownerAssignmentMode: true
        }
      })
    : [];

  let batchFailed = 0;
  for (const user of users) {
    try {
      const decision = await assignUserOwner(user.id, now);
      const tasks = await prisma.recallTask.findMany({
        where: {
          userId: user.id,
          status: { in: ["UNASSIGNED", "TODO"] }
        },
        select: { id: true }
      });
      for (const task of tasks) {
        await assignTask(task.id, now);
      }
      await prisma.assignmentRecalculationRun.update({
        where: { id: run.id },
        data: {
          processedUsers: { increment: 1 },
          succeededUsers: { increment: 1 },
          ownerChanges: {
            increment: decision.assigneeId === user.ownerId ? 0 : 1
          },
          reassignedTasks: { increment: tasks.length },
          lastProcessedUserId: user.id
        }
      });
    } catch (error) {
      batchFailed += 1;
      await prisma.assignmentRecalculationRun.update({
        where: { id: run.id },
        data: {
          processedUsers: { increment: 1 },
          failedUsers: { increment: 1 },
          lastProcessedUserId: user.id,
          errorSummary: {
            lastFailure: {
              userId: user.id,
              message: errorMessage(error)
            }
          }
        }
      });
    }
  }

  if (users.length === batchSize) {
    await scheduler.scheduleAssignmentRecalculation?.({
      runId: run.id
    });
    const current =
      await prisma.assignmentRecalculationRun.findUniqueOrThrow({
        where: { id: run.id }
      });
    return {
      completed: false as const,
      processedUsers: current.processedUsers,
      failedUsers: current.failedUsers
    };
  }

  const final = await prisma.assignmentRecalculationRun.update({
    where: { id: run.id },
    data: {
      status:
        run.failedUsers + batchFailed > 0
          ? "PARTIAL_FAILURE"
          : "COMPLETED",
      completedAt: now
    }
  });
  return {
    completed: true as const,
    processedUsers: final.processedUsers,
    failedUsers: final.failedUsers
  };
}
