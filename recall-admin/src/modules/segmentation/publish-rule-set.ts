import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import {
  hashSegmentRuleSet,
  verifySegmentPreview
} from "@/modules/segmentation/preview-token";
import {
  segmentRuleSetSchema
} from "@/modules/segmentation/rule-definition";
import type { TaskScheduler } from "@/modules/tasks/scheduler";

export type PublishSegmentRuleSetInput = {
  actorId: string;
  draft: unknown;
  previewToken: string;
  idempotencyKey: string;
  scheduler: TaskScheduler;
  now?: Date;
};

export async function publishSegmentRuleSet(
  input: PublishSegmentRuleSetInput
) {
  const draft = segmentRuleSetSchema.parse(input.draft);
  if (draft.changeSummary.trim().length < 4) {
    throw new Error("segment rule change summary is required");
  }
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 160) {
    throw new Error("valid idempotency key is required");
  }
  const now = input.now ?? new Date();
  const draftHash = hashSegmentRuleSet(draft);
  verifySegmentPreview(
    input.previewToken,
    input.actorId,
    draftHash,
    now
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const actor = await tx.member.findUniqueOrThrow({
            where: { id: input.actorId },
            select: { id: true, role: true, active: true }
          });
          if (!actor.active) {
            throw new ForbiddenError("rules:publish");
          }
          assertMemberPermission(actor, "rules:publish");

          await tx.$queryRaw(
            Prisma.sql`
              SELECT pg_advisory_xact_lock(
                hashtext('segmentation')
              )::text AS "locked"
            `
          );
          const existing =
            await tx.segmentRecalculationRun.findUnique({
              where: { idempotencyKey },
              include: { ruleVersion: true }
            });
          if (existing) {
            return {
              ruleVersion: existing.ruleVersion,
              run: existing,
              shouldSchedule: false
            };
          }

          const latest = await tx.automationRuleVersion.findFirst({
            where: { kind: "segmentation" },
            orderBy: { version: "desc" },
            select: { version: true }
          });
          const version = (latest?.version ?? 0) + 1;
          await tx.automationRuleVersion.updateMany({
            where: { kind: "segmentation", active: true },
            data: { active: false }
          });
          const ruleVersion = await tx.automationRuleVersion.create({
            data: {
              kind: "segmentation",
              version,
              config: draft as unknown as Prisma.InputJsonValue,
              active: true,
              createdById: actor.id
            }
          });
          const [totalUsers, upperBoundUser] = await Promise.all([
            tx.userProfile.count(),
            tx.userProfile.findFirst({
              orderBy: { id: "desc" },
              select: { id: true }
            })
          ]);
          const run = await tx.segmentRecalculationRun.create({
            data: {
              ruleVersionId: ruleVersion.id,
              ruleVersionNumber: version,
              requestedById: actor.id,
              idempotencyKey,
              totalUsers,
              upperBoundUserId: upperBoundUser?.id ?? null,
              previewSummary: {
                draftHash
              }
            }
          });
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              action: "segment_rule.published",
              entityType: "AutomationRuleVersion",
              entityId: ruleVersion.id,
              metadata: {
                version,
                draftHash,
                changeSummary: draft.changeSummary,
                recalculationRunId: run.id,
                totalUsers
              }
            }
          });
          return { ruleVersion, run, shouldSchedule: true };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );
      if (result.shouldSchedule) {
        await input.scheduler.scheduleSegmentRecalculation?.({
          runId: result.run.id
        });
      }
      return {
        ruleVersion: result.ruleVersion,
        run: result.run
      };
    } catch (error) {
      const retry =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2;
      if (!retry) {
        throw error;
      }
    }
  }
  throw new Error("segment rule publication retry exhausted");
}
