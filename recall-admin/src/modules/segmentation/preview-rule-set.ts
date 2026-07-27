import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import { evaluateRuleSet } from "@/modules/segmentation/evaluate-rule-set";
import {
  hashSegmentRuleSet,
  signSegmentPreview
} from "@/modules/segmentation/preview-token";
import {
  segmentRuleSetSchema,
  type SegmentRuleSet
} from "@/modules/segmentation/rule-definition";
import { buildSegmentFacts } from "@/modules/segmentation/segment-facts";
import type { SegmentCode } from "@/modules/segmentation/types";
import { getTaskPolicy } from "@/modules/tasks/trigger-policy";
import { mergeManagedUser } from "@/modules/users/managed-user";
import { getProductionRightTokenUserFactsByIds } from "@/modules/users/righttoken-facts";

const segmentCodes: SegmentCode[] = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G"
];

type TransitionCount = {
  added: number;
  removed: number;
  unchanged: number;
};

export type SegmentRulePreviewSample = {
  externalUserId: string;
  fromSegment: SegmentCode;
  toSegment: SegmentCode;
  matchedGroups: SegmentCode[];
};

export type SegmentRulePreview = {
  totalUsers: number;
  distribution: Record<SegmentCode, number>;
  transitions: Record<SegmentCode, TransitionCount>;
  migrations: number;
  overlapUsers: number;
  fallbackUsers: number;
  tasksToCancel: number;
  tasksToCreate: number;
  urgentTasksToCreate: number;
  samples: SegmentRulePreviewSample[];
  draftHash: string;
  expiresAt: string;
  token: string;
};

function emptyCounts(): {
  distribution: Record<SegmentCode, number>;
  transitions: Record<SegmentCode, TransitionCount>;
} {
  return {
    distribution: Object.fromEntries(
      segmentCodes.map((code) => [code, 0])
    ) as Record<SegmentCode, number>,
    transitions: Object.fromEntries(
      segmentCodes.map((code) => [
        code,
        { added: 0, removed: 0, unchanged: 0 }
      ])
    ) as Record<SegmentCode, TransitionCount>
  };
}

function needsRegistrationIp(ruleSet: SegmentRuleSet): boolean {
  return ruleSet.groups.some((group) =>
    group.branches.some((branch) =>
      branch.clauses.some(
        (clause) => clause.field === "registrationIp"
      )
    )
  );
}

function decryptIp(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  return createFieldCipher(Buffer.from(key, "base64")).decrypt(value);
}

export async function previewSegmentRuleSet(
  actorId: string,
  rawDraft: unknown,
  now = new Date()
): Promise<SegmentRulePreview> {
  const draft = segmentRuleSetSchema.parse(rawDraft);
  const { distribution, transitions } = emptyCounts();
  const includeIp = needsRegistrationIp(draft);
  const samples: SegmentRulePreviewSample[] = [];
  let cursor: string | undefined;
  let totalUsers = 0;
  let migrations = 0;
  let overlapUsers = 0;
  let fallbackUsers = 0;
  let tasksToCancel = 0;
  let tasksToCreate = 0;
  let urgentTasksToCreate = 0;

  while (true) {
    const users = await prisma.userProfile.findMany({
      where: {
        sourceDeletedAt: null,
        ...(cursor ? { id: { gt: cursor } } : {})
      },
      orderBy: { id: "asc" },
      take: 500,
      include: {
        tasks: {
          where: {
            origin: "AUTOMATION",
            status: { in: ["UNASSIGNED", "TODO"] }
          },
          select: { triggerKey: true }
        }
      }
    });
    if (users.length === 0) {
      break;
    }

    const liveFacts = await getProductionRightTokenUserFactsByIds(
      users.map((user) => user.externalUserId)
    );
    for (const persistedUser of users) {
      const facts = liveFacts.get(persistedUser.externalUserId);
      const user = facts
        ? mergeManagedUser(persistedUser, facts)
        : persistedUser;
      totalUsers += 1;
      const evaluation = evaluateRuleSet(
        buildSegmentFacts(
          user,
          now,
          includeIp
            ? (facts?.registrationIp ??
              decryptIp(user.registrationIpEnc))
            : null
        ),
        draft
      );
      const toSegment = evaluation.segment;
      distribution[toSegment] += 1;
      if (evaluation.matchedGroups.length > 1) {
        overlapUsers += 1;
      }
      if (toSegment === "G") {
        fallbackUsers += 1;
      }

      if (toSegment === user.currentSegment) {
        transitions[toSegment].unchanged += 1;
      } else {
        migrations += 1;
        transitions[toSegment].added += 1;
        transitions[user.currentSegment].removed += 1;
        tasksToCancel += user.tasks.filter((task) =>
          task.triggerKey.startsWith(`${user.currentSegment}:`)
        ).length;
        const policy = getTaskPolicy(draft, toSegment);
        if (policy.enabled) {
          tasksToCreate += 1;
          if (toSegment === "F") {
            urgentTasksToCreate += 1;
          }
        }
      }
      if (
        samples.length < 20 &&
        (toSegment !== user.currentSegment ||
          evaluation.matchedGroups.length > 1)
      ) {
        samples.push({
          externalUserId: user.externalUserId,
          fromSegment: user.currentSegment,
          toSegment,
          matchedGroups: evaluation.matchedGroups
        });
      }
    }
    cursor = users.at(-1)!.id;
  }

  const draftHash = hashSegmentRuleSet(draft);
  const expiresAt = new Date(
    now.getTime() + 30 * 60_000
  ).toISOString();
  return {
    totalUsers,
    distribution,
    transitions,
    migrations,
    overlapUsers,
    fallbackUsers,
    tasksToCancel,
    tasksToCreate,
    urgentTasksToCreate,
    samples,
    draftHash,
    expiresAt,
    token: signSegmentPreview({
      actorId,
      draftHash,
      expiresAt
    })
  };
}
