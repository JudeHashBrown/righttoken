import type { UserProfile } from "@/generated/prisma/client";
import type { TransactionClient } from "@/lib/db/transaction";
import { presentServiceAnomaly } from "@/modules/anomalies/presentation";
import { classifyUser } from "@/modules/segmentation/classify-user";
import { loadActiveSegmentRuleSet } from "@/modules/segmentation/rule-config";
import { closeObsoleteAutomationTasks } from "@/modules/tasks/close-obsolete-tasks";
import { mergeManagedUser } from "@/modules/users/managed-user";
import { getProductionRightTokenUserFactsByIds } from "@/modules/users/righttoken-facts";

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
  if (user.sourceDeletedAt) {
    return {
      previousSegment: user.currentSegment,
      currentSegment: user.currentSegment,
      changed: false,
      reason: "RightToken 用户已删除",
      ruleVersion: user.segmentRuleVersion,
      segmentChanged: null
    };
  }
  const { config, version: ruleVersion } =
    await loadActiveSegmentRuleSet(tx);
  const liveFacts = (
    await getProductionRightTokenUserFactsByIds([
      user.externalUserId
    ])
  ).get(user.externalUserId);
  const currentUser = liveFacts
    ? mergeManagedUser(user, liveFacts)
    : user;
  const automaticDecision = classifyUser(
    currentUser,
    now,
    config
  );

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
  const resolvedReason =
    decision.segment === "F"
      ? presentServiceAnomaly(currentUser)?.taskReason ??
        decision.reason
      : decision.reason;
  await tx.userProfile.update({
    where: { id: user.id },
    data: {
      currentSegment: decision.segment,
      segmentRuleVersion: ruleVersion,
      reasonLabel: resolvedReason
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
        reason: `${reason}: ${resolvedReason}`
      }
    });
  }

  return {
    previousSegment: user.currentSegment,
    currentSegment: decision.segment,
    changed,
    reason: resolvedReason,
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
