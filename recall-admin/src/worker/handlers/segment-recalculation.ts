import { z } from "zod";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import {
  assignTask,
  assignUserOwner
} from "@/modules/assignment/assign-task";
import { evaluateRuleSet } from "@/modules/segmentation/evaluate-rule-set";
import { getNextRuleBoundary } from "@/modules/segmentation/next-rule-boundary";
import { parseSegmentRuleConfig } from "@/modules/segmentation/rule-config";
import { buildSegmentFacts } from "@/modules/segmentation/segment-facts";
import { cancelSupersededAutomationTasks } from "@/modules/tasks/cancel-superseded-automation-tasks";
import { createTriggeredTask } from "@/modules/tasks/create-triggered-task";
import {
  noopTaskScheduler,
  type TaskScheduler
} from "@/modules/tasks/scheduler";
import { getTaskPolicy } from "@/modules/tasks/trigger-policy";
import { mergeManagedUser } from "@/modules/users/managed-user";
import { getProductionRightTokenUserFactsByIds } from "@/modules/users/righttoken-facts";

const inputSchema = z.object({
  runId: z.string().min(1)
});

export type SegmentRecalculationInput = z.input<typeof inputSchema>;

function decryptRegistrationIp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  return createFieldCipher(
    Buffer.from(encryptionKey, "base64")
  ).decrypt(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

export async function handleSegmentRecalculation(
  rawInput: SegmentRecalculationInput,
  now = new Date(),
  scheduler: TaskScheduler = noopTaskScheduler,
  batchSize = 200
) {
  const input = inputSchema.parse(rawInput);
  const run = await prisma.segmentRecalculationRun.findUniqueOrThrow({
    where: { id: input.runId },
    include: { ruleVersion: true }
  });
  if (run.status === "COMPLETED") {
    return {
      completed: true as const,
      processedUsers: run.processedUsers,
      failedUsers: run.failedUsers
    };
  }
  const ruleSet = parseSegmentRuleConfig(run.ruleVersion.config);
  await prisma.segmentRecalculationRun.update({
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
          id: {
            ...(run.lastProcessedUserId
              ? { gt: run.lastProcessedUserId }
              : {}),
            lte: run.upperBoundUserId
          }
        },
        orderBy: { id: "asc" },
        take: batchSize
      })
    : [];
  const liveFactsByExternalId =
    await getProductionRightTokenUserFactsByIds(
      users.map((user) => user.externalUserId)
    );

  let batchProcessed = 0;
  let batchFailed = 0;
  for (const user of users) {
    try {
      const outcome = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "recall"."UserProfile"
          WHERE "id" = ${user.id}
          FOR UPDATE
        `;
        const current = await tx.userProfile.findUniqueOrThrow({
          where: { id: user.id }
        });
        const liveFacts = liveFactsByExternalId.get(
          current.externalUserId
        );
        const currentUser = liveFacts
          ? mergeManagedUser(current, liveFacts)
          : current;
        const facts = buildSegmentFacts(
          currentUser,
          now,
          liveFacts?.registrationIp ??
            decryptRegistrationIp(current.registrationIpEnc)
        );
        const automaticDecision = evaluateRuleSet(facts, ruleSet);
        let segment = automaticDecision.segment;
        let reason = automaticDecision.reason;
        if (segment !== "F") {
          const override = await tx.segmentOverride.findFirst({
            where: {
              userId: current.id,
              revokedAt: null,
              expiresAt: { gt: now }
            },
            orderBy: { createdAt: "desc" }
          });
          if (override) {
            segment = override.segment;
            reason = `manual override: ${override.reason}`;
          }
        }
        const cancelledTasks =
          await cancelSupersededAutomationTasks(
            tx,
            current.id,
            run.ruleVersionNumber,
            now
          );
        const changed = segment !== current.currentSegment;
        const updated = await tx.userProfile.update({
          where: { id: current.id },
          data: {
            currentSegment: segment,
            segmentRuleVersion: run.ruleVersionNumber,
            reasonLabel: reason
          }
        });
        if (changed) {
          await tx.segmentHistory.create({
            data: {
              userId: current.id,
              fromSegment: current.currentSegment,
              toSegment: segment,
              ruleVersion: run.ruleVersionNumber,
              reason: `segment rule publication: ${reason}`
            }
          });
        }
        return {
          updated,
          boundaryUser: liveFacts
            ? mergeManagedUser(updated, liveFacts)
            : updated,
          changed,
          cancelledTasks,
          reason
        };
      });

      await assignUserOwner(user.id, now);
      let createdTasks = 0;
      const boundary = getNextRuleBoundary(
        outcome.boundaryUser,
        ruleSet,
        run.ruleVersionNumber,
        now
      );
      if (
        boundary?.purpose === "TASK" &&
        boundary.runAt <= now &&
        boundary.expectedSegment === outcome.updated.currentSegment
      ) {
        const triggerKey =
          `${outcome.updated.currentSegment}:${boundary.boundaryKey}:` +
          boundary.runAt.toISOString();
        const existing = await prisma.recallTask.findUnique({
          where: {
            userId_triggerKey_ruleVersion: {
              userId: user.id,
              triggerKey,
              ruleVersion: run.ruleVersionNumber
            }
          },
          select: { id: true }
        });
        const task = await createTriggeredTask({
          userId: user.id,
          segment: outcome.updated.currentSegment,
          policyKey: boundary.boundaryKey,
          windowStart: boundary.runAt,
          ruleVersion: run.ruleVersionNumber,
          reason: `规则发布后命中：${outcome.reason}`,
          policy: getTaskPolicy(
            ruleSet,
            outcome.updated.currentSegment
          ),
          now
        });
        if (!existing) {
          createdTasks = 1;
        }
        if (task.status === "UNASSIGNED" || task.status === "TODO") {
          await assignTask(task.id, now);
        }
        const nextBoundary = getNextRuleBoundary(
          outcome.boundaryUser,
          ruleSet,
          run.ruleVersionNumber,
          now,
          { includeTask: false }
        );
        if (nextBoundary) {
          await scheduler.scheduleSegmentCheck({
            ...nextBoundary,
            userId: user.id
          });
        }
      } else if (boundary) {
        await scheduler.scheduleSegmentCheck({
          ...boundary,
          userId: user.id
        });
      }

      await prisma.segmentRecalculationRun.update({
        where: { id: run.id },
        data: {
          processedUsers: { increment: 1 },
          succeededUsers: { increment: 1 },
          segmentChanges: { increment: outcome.changed ? 1 : 0 },
          cancelledTasks: { increment: outcome.cancelledTasks },
          createdTasks: { increment: createdTasks },
          lastProcessedUserId: user.id
        }
      });
      batchProcessed += 1;
    } catch (error) {
      await prisma.segmentRecalculationRun.update({
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
      batchProcessed += 1;
      batchFailed += 1;
    }
  }

  const hasMore = users.length === batchSize;
  if (hasMore) {
    await scheduler.scheduleSegmentRecalculation?.({ runId: run.id });
    const current = await prisma.segmentRecalculationRun.findUniqueOrThrow({
      where: { id: run.id }
    });
    return {
      completed: false as const,
      processedUsers: current.processedUsers,
      failedUsers: current.failedUsers
    };
  }

  const final = await prisma.segmentRecalculationRun.update({
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
    failedUsers: final.failedUsers,
    batchProcessed
  };
}
