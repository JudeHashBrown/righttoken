import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { assertMemberPermission, ForbiddenError } from "@/modules/auth/guards";
import { segmentConfigSchema } from "@/modules/segmentation/rule-config";

type RuleConfigParser = {
  parse(value: unknown): Prisma.InputJsonValue;
};

export async function publishAutomationRuleVersion(
  actorId: string,
  kind: string,
  config: unknown,
  parser: RuleConfigParser = segmentConfigSchema
) {
  const normalizedKind = kind.trim();
  if (!normalizedKind) {
    throw new Error("rule kind is required");
  }
  const parsedConfig = parser.parse(config);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const actor = await tx.member.findUniqueOrThrow({
            where: { id: actorId },
            select: { id: true, role: true, active: true }
          });
          if (!actor.active) {
            throw new ForbiddenError("rules:publish");
          }
          assertMemberPermission(actor, "rules:publish");

          await tx.$queryRaw(
            Prisma.sql`
              SELECT pg_advisory_xact_lock(
                hashtext(${normalizedKind})
              )::text AS "locked"
            `
          );

          const latest = await tx.automationRuleVersion.findFirst({
            where: { kind: normalizedKind },
            orderBy: { version: "desc" },
            select: { version: true }
          });
          const version = (latest?.version ?? 0) + 1;

          await tx.automationRuleVersion.updateMany({
            where: { kind: normalizedKind, active: true },
            data: { active: false }
          });
          const published = await tx.automationRuleVersion.create({
            data: {
              kind: normalizedKind,
              version,
              config: parsedConfig,
              active: true,
              createdById: actor.id
            }
          });
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              action: "automation_rule.published",
              entityType: "AutomationRuleVersion",
              entityId: published.id,
              metadata: {
                kind: normalizedKind,
                version
              }
            }
          });

          return published;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );
    } catch (error) {
      const canRetry =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2;
      if (!canRetry) {
        throw error;
      }
    }
  }

  throw new Error("automation rule publication retry exhausted");
}
