import type { UserProfile } from "@/generated/prisma/client";
import type { TransactionClient } from "@/lib/db/transaction";
import { classifyUser } from "@/modules/segmentation/classify-user";
import { loadActiveSegmentRule } from "@/modules/segmentation/rule-config";
import { closeObsoleteAutomationTasks } from "@/modules/tasks/close-obsolete-tasks";

export type SegmentChange = {
  previousSegment: UserProfile["currentSegment"];
  currentSegment: UserProfile["currentSegment"];
  changed: boolean;
  reason: string;
  ruleVersion: number;
  segmentChanged: {
    userId: string;
    from: UserProfile["currentSegment"];
    to: UserProfile["currentSegment"];
    changedAt: Date;
    ruleVersion: number;
  } | null;
};

export async function resegmentUser(
  tx: TransactionClient,
  user: UserProfile,
  reason: string,
  now = new Date()
): Promise<SegmentChange> {
  const { config, version: ruleVersion } =
    await loadActiveSegmentRule(tx);
  const automaticDecision = classifyUser(user, now, config);

  let decision = automaticDecision;
  if (automaticDecision.segment !== "F") {
    const override = await tx.segmentOverride.findFirst({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: now }
      },
      orderBy: { createdAt: "desc" }
    });
    if (override) {
      decision = {
        segment: override.segment,
        reason: `manual override: ${override.reason}`
      };
    }
  }

  const changed = decision.segment !== user.currentSegment;
  await tx.userProfile.update({
    where: { id: user.id },
    data: {
      currentSegment: decision.segment,
      segmentRuleVersion: ruleVersion,
      reasonLabel: decision.reason
    }
  });

  if (changed) {
    await closeObsoleteAutomationTasks(
      tx,
      user.id,
      user.currentSegment,
      now
    );
    await tx.segmentHistory.create({
      data: {
        userId: user.id,
        fromSegment: user.currentSegment,
        toSegment: decision.segment,
        ruleVersion,
        reason: `${reason}: ${decision.reason}`
      }
    });
  }

  return {
    previousSegment: user.currentSegment,
    currentSegment: decision.segment,
    changed,
    reason: decision.reason,
    ruleVersion,
    segmentChanged: changed
      ? {
          userId: user.id,
          from: user.currentSegment,
          to: decision.segment,
          changedAt: now,
          ruleVersion
        }
      : null
  };
}
