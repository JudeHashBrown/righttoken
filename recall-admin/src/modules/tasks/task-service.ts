import {
  Prisma,
  type Member,
  type RecallTask,
  type TaskStatus
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import { openTaskStatuses } from "@/modules/tasks/close-obsolete-tasks";

const allowedTransitions = {
  UNASSIGNED: ["TODO", "CANCELLED"],
  TODO: ["IN_PROGRESS", "PAUSED", "CANCELLED"],
  IN_PROGRESS: [
    "WAITING_USER",
    "COMPLETED",
    "PAUSED",
    "CANCELLED"
  ],
  WAITING_USER: [
    "IN_PROGRESS",
    "COMPLETED",
    "PAUSED",
    "CANCELLED"
  ],
  PAUSED: ["TODO", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: []
} as const satisfies Record<TaskStatus, readonly TaskStatus[]>;

export class InvalidTaskTransitionError extends Error {
  constructor(from: TaskStatus, to: TaskStatus) {
    super(`invalid task transition: ${from} → ${to}`);
    this.name = "InvalidTaskTransitionError";
  }
}

function assertTaskActor(
  actor: Pick<Member, "id" | "role" | "active">,
  task: Pick<RecallTask, "assigneeId">,
  options: { allowUnassigned?: boolean } = {}
): void {
  if (!actor.active) {
    throw new ForbiddenError("tasks:work");
  }
  assertMemberPermission(actor, "tasks:work");
  if (
    actor.role === "OPERATOR" &&
    task.assigneeId !== actor.id &&
    !(options.allowUnassigned && task.assigneeId === null)
  ) {
    throw new ForbiddenError("tasks:work");
  }
}

async function transitionTask(
  taskId: string,
  actorId: string,
  toStatus: TaskStatus,
  action: string,
  now: Date,
  options: { cancelReason?: string } = {}
): Promise<RecallTask> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "recall"."RecallTask"
        WHERE "id" = ${taskId}
        FOR UPDATE
      `
    );
    const [task, actor] = await Promise.all([
      tx.recallTask.findUniqueOrThrow({ where: { id: taskId } }),
      tx.member.findUniqueOrThrow({ where: { id: actorId } })
    ]);
    assertTaskActor(actor, task);

    const nextStatuses =
      allowedTransitions[task.status] as readonly TaskStatus[];
    if (!nextStatuses.includes(toStatus)) {
      throw new InvalidTaskTransitionError(task.status, toStatus);
    }

    const data: Prisma.RecallTaskUpdateInput = {
      status: toStatus
    };
    if (toStatus === "IN_PROGRESS" && !task.startedAt) {
      data.startedAt = now;
    }
    if (toStatus === "COMPLETED") {
      data.completedAt = now;
    }
    if (toStatus === "CANCELLED") {
      const cancelReason = options.cancelReason?.trim();
      if (!cancelReason) {
        throw new Error("cancel reason is required");
      }
      data.cancelledAt = now;
      data.cancelReason = cancelReason;
    }

    const updated = await tx.recallTask.update({
      where: { id: task.id },
      data
    });
    await tx.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: actor.id,
        action,
        detail:
          toStatus === "CANCELLED"
            ? { cancelReason: options.cancelReason }
            : { from: task.status, to: toStatus }
      }
    });
    return updated;
  });
}

export async function claimTask(
  taskId: string,
  actorId: string,
  now = new Date()
): Promise<RecallTask> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "recall"."RecallTask"
        WHERE "id" = ${taskId}
        FOR UPDATE
      `
    );
    const [task, actor] = await Promise.all([
      tx.recallTask.findUniqueOrThrow({ where: { id: taskId } }),
      tx.member.findUniqueOrThrow({ where: { id: actorId } })
    ]);
    assertTaskActor(actor, task, { allowUnassigned: true });
    if (task.status !== "UNASSIGNED" || task.assigneeId) {
      throw new InvalidTaskTransitionError(task.status, "TODO");
    }

    const updated = await tx.recallTask.update({
      where: { id: task.id },
      data: {
        status: "TODO",
        assigneeId: actor.id,
        assignmentReason: "claimed"
      }
    });
    await tx.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: actor.id,
        action: "task.claimed",
        detail: { claimedAt: now.toISOString() }
      }
    });
    return updated;
  });
}

export function startTask(
  taskId: string,
  actorId: string,
  now = new Date()
): Promise<RecallTask> {
  return transitionTask(
    taskId,
    actorId,
    "IN_PROGRESS",
    "task.started",
    now
  );
}

export function waitForUser(
  taskId: string,
  actorId: string,
  now = new Date()
): Promise<RecallTask> {
  return transitionTask(
    taskId,
    actorId,
    "WAITING_USER",
    "task.waiting_user",
    now
  );
}

export function completeTask(
  taskId: string,
  actorId: string,
  now = new Date()
): Promise<RecallTask> {
  return transitionTask(
    taskId,
    actorId,
    "COMPLETED",
    "task.completed",
    now
  );
}

export function pauseTask(
  taskId: string,
  actorId: string,
  now = new Date()
): Promise<RecallTask> {
  return transitionTask(
    taskId,
    actorId,
    "PAUSED",
    "task.paused",
    now
  );
}

export function resumeTask(
  taskId: string,
  actorId: string,
  now = new Date()
): Promise<RecallTask> {
  return transitionTask(
    taskId,
    actorId,
    "TODO",
    "task.resumed",
    now
  );
}

export function cancelTask(
  taskId: string,
  actorId: string,
  reason: string,
  now = new Date()
): Promise<RecallTask> {
  return transitionTask(
    taskId,
    actorId,
    "CANCELLED",
    "task.cancelled",
    now,
    { cancelReason: reason }
  );
}

export async function transferTask(
  taskId: string,
  actorId: string,
  targetAssigneeId: string,
  reason: string,
  now = new Date()
): Promise<RecallTask> {
  const normalizedReason = reason.trim();
  if (!normalizedReason) {
    throw new Error("transfer reason is required");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "recall"."RecallTask"
        WHERE "id" = ${taskId}
        FOR UPDATE
      `
    );
    const [task, actor, target] = await Promise.all([
      tx.recallTask.findUniqueOrThrow({ where: { id: taskId } }),
      tx.member.findUniqueOrThrow({ where: { id: actorId } }),
      tx.member.findUniqueOrThrow({
        where: { id: targetAssigneeId }
      })
    ]);
    assertTaskActor(actor, task);
    if (
      !target.active ||
      !openTaskStatuses.includes(task.status)
    ) {
      throw new ForbiddenError("tasks:work");
    }
    assertMemberPermission(target, "tasks:work");

    const updated = await tx.recallTask.update({
      where: { id: task.id },
      data: {
        assigneeId: target.id,
        assignmentReason: normalizedReason,
        ...(task.status === "UNASSIGNED" ? { status: "TODO" } : {})
      }
    });
    await tx.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: actor.id,
        action: "task.transferred",
        detail: {
          fromAssigneeId: task.assigneeId,
          toAssigneeId: target.id,
          reason: normalizedReason,
          transferredAt: now.toISOString()
        }
      }
    });
    return updated;
  });
}
