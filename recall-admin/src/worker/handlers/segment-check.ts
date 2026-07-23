import { z } from "zod";
import type { UserProfile } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assignTask } from "@/modules/assignment/assign-task";
import { resegmentUser } from "@/modules/segmentation/resegment-user";
import { createTriggeredTask } from "@/modules/tasks/create-triggered-task";
import { getTriggerPolicy } from "@/modules/tasks/trigger-policy";

const segmentCheckSchema = z.object({
  userId: z.string().min(1),
  expectedSegment: z.enum(["A", "B", "C", "D", "E", "F", "G"]),
  expectedFactTimestamp: z.string().datetime({ offset: true }),
  runAt: z.coerce.date(),
  reasonKey: z.string().min(1).max(120)
});

export type SegmentCheckInput = z.input<typeof segmentCheckSchema>;

function currentFactTimestamp(
  user: UserProfile,
  reasonKey: string
): Date | null {
  switch (reasonKey) {
    case "registration_unpaid":
      return user.registeredAt;
    case "checkout_unpaid":
      return user.checkoutStartedAt;
    case "paid_without_call":
      return user.firstPaidAt;
    case "inactivity_boundary":
    case "inactive_with_balance":
      return user.lastCallAt;
    case "balance_exhausted":
      return user.balanceChangedAt;
    case "active_anomaly":
      return user.anomalyChangedAt;
    default:
      return null;
  }
}

export async function handleSegmentCheck(
  rawInput: SegmentCheckInput,
  now = new Date()
) {
  const input = segmentCheckSchema.parse(rawInput);
  if (input.runAt > now) {
    return { skipped: "not_due" as const };
  }

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "UserProfile"
      WHERE "id" = ${input.userId}
      FOR UPDATE
    `;
    const user = await tx.userProfile.findUniqueOrThrow({
      where: { id: input.userId }
    });
    const factTimestamp = currentFactTimestamp(
      user,
      input.reasonKey
    );
    if (
      user.currentSegment !== input.expectedSegment ||
      !factTimestamp ||
      factTimestamp.toISOString() !== input.expectedFactTimestamp
    ) {
      return { skipped: "state_changed" as const };
    }

    const segmentChange = await resegmentUser(
      tx,
      user,
      `scheduled check ${input.reasonKey}`,
      now
    );
    return {
      segment: segmentChange.currentSegment,
      ruleVersion: segmentChange.ruleVersion
    };
  });
  if ("skipped" in outcome) {
    return outcome;
  }

  const policy = getTriggerPolicy(outcome.segment);
  if (!policy.enabled) {
    return {
      checked: true as const,
      segment: outcome.segment,
      taskId: null
    };
  }
  const task = await createTriggeredTask({
    userId: input.userId,
    segment: outcome.segment,
    policyKey: input.reasonKey,
    windowStart: new Date(input.expectedFactTimestamp),
    ruleVersion: outcome.ruleVersion,
    reason: `定时检查命中：${input.reasonKey}`,
    now
  });
  if (task.status === "UNASSIGNED" || task.status === "TODO") {
    await assignTask(task.id, now);
  }

  return {
    checked: true as const,
    segment: outcome.segment,
    taskId: task.id
  };
}
