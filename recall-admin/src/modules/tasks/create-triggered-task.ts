import {
  Prisma,
  type RecallTask,
  type SegmentCode
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getTriggerPolicy } from "@/modules/tasks/trigger-policy";
import { createTaskNotificationIntents } from "@/modules/notifications/notification-service";

const taskTitles: Record<SegmentCode, string> = {
  A: "注册后尚未完成首单支付",
  B: "发起结账后尚未支付",
  C: "已支付但尚未成功调用",
  D: "账户有余额但长期未调用",
  E: "账户余额已耗尽",
  F: "用户遇到异常需要紧急介入",
  G: "健康活跃用户"
};

export type CreateTriggeredTaskInput = {
  userId: string;
  segment: SegmentCode;
  policyKey: string;
  windowStart: Date;
  ruleVersion: number;
  reason: string;
  now?: Date;
};

export async function createTriggeredTask(
  input: CreateTriggeredTaskInput
): Promise<RecallTask> {
  const policy = getTriggerPolicy(input.segment);
  if (!policy.enabled) {
    throw new Error(`segment ${input.segment} does not create recall tasks`);
  }
  const policyKey = input.policyKey.trim();
  const reason = input.reason.trim();
  if (!policyKey || !reason) {
    throw new Error("task policy key and reason are required");
  }
  const now = input.now ?? new Date();
  const triggerKey =
    `${input.segment}:${policyKey}:${input.windowStart.toISOString()}`;

  let task: RecallTask;
  try {
    task = await prisma.$transaction(async (tx) => {
      const task = await tx.recallTask.create({
        data: {
          userId: input.userId,
          origin: "AUTOMATION",
          triggerKey,
          ruleVersion: input.ruleVersion,
          title: taskTitles[input.segment],
          reason,
          priority: policy.priority,
          dueAt: new Date(
            now.getTime() +
              policy.dueMinutesAfterCreation * 60 * 1000
          )
        }
      });
      await tx.taskActivity.create({
        data: {
          taskId: task.id,
          action: "task.created",
          detail: {
            segment: input.segment,
            policyKey,
            ruleVersion: input.ruleVersion
          }
        }
      });
      return task;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      task = await prisma.recallTask.findUniqueOrThrow({
        where: {
          userId_triggerKey_ruleVersion: {
            userId: input.userId,
            triggerKey,
            ruleVersion: input.ruleVersion
          }
        }
      });
    } else {
      throw error;
    }
  }
  await createTaskNotificationIntents(task.id, now);
  return task;
}
