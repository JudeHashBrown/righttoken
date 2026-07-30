import { Prisma } from "@/generated/prisma/client";
import { createFieldCipher } from "@/lib/crypto/field-encryption";
import { prisma } from "@/lib/db/prisma";
import type { TransactionClient } from "@/lib/db/transaction";
import { assignUserOwnerInTransaction } from "@/modules/assignment/assign-task";
import { createGeoIpResolver } from "@/modules/geoip/http-resolver";
import { recalculateStoredUserLocation } from "@/modules/location/recompute-user";
import { loadActiveLocationRules } from "@/modules/location/rule-repository";
import { UserLocationError } from "@/modules/users/location-errors";
import { transferOpenUserTasks } from "@/modules/users/transfer-open-user-tasks";

export type LocationChangeResult = {
  userId: string;
  previousCountryCode: string | null;
  previousRegion: string | null;
  countryCode: string | null;
  region: string | null;
  mode: "AUTO" | "MANUAL";
  previousOwnerId: string | null;
  ownerId: string | null;
  ownerRecalculated: boolean;
  transferredTasks: number;
};

type LocationChangeInput = {
  userId: string;
  actorId: string;
  now?: Date;
};

type LocationUser = {
  id: string;
  email: string;
  registrationIpEnc: string | null;
  ipCountryCode: string | null;
  ipRegion: string | null;
  countryCode: string | null;
  region: string | null;
  locationAssignmentMode: "AUTO" | "MANUAL";
  ownerId: string | null;
  ownerAssignmentMode: "AUTO" | "MANUAL";
  sourceDeletedAt: Date | null;
};

function assertAdministrator(actor: {
  role: "PRIMARY_ADMIN" | "ADMIN" | "OPERATOR";
  active: boolean;
}): void {
  if (
    !actor.active ||
    !["PRIMARY_ADMIN", "ADMIN"].includes(actor.role)
  ) {
    throw new UserLocationError("FORBIDDEN");
  }
}

async function lockUser(
  tx: TransactionClient,
  userId: string
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`
      SELECT "id"
      FROM "recall"."UserProfile"
      WHERE "id" = ${userId}
      FOR UPDATE
    `
  );
}

function decryptRegistrationIp(value: string | null): string | null {
  if (!value) return null;
  const encryptionKey = process.env.APP_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }
  return createFieldCipher(
    Buffer.from(encryptionKey, "base64")
  ).decrypt(value);
}

async function loadActorAndUser(
  tx: TransactionClient,
  input: LocationChangeInput
): Promise<{
  actor: {
    id: string;
    role: "PRIMARY_ADMIN" | "ADMIN" | "OPERATOR";
    active: boolean;
  };
  user: LocationUser;
}> {
  const [actor, user] = await Promise.all([
    tx.member.findUniqueOrThrow({
      where: { id: input.actorId },
      select: { id: true, role: true, active: true }
    }),
    tx.userProfile.findUniqueOrThrow({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        registrationIpEnc: true,
        ipCountryCode: true,
        ipRegion: true,
        countryCode: true,
        region: true,
        locationAssignmentMode: true,
        ownerId: true,
        ownerAssignmentMode: true,
        sourceDeletedAt: true
      }
    })
  ]);
  assertAdministrator(actor);
  if (user.sourceDeletedAt) {
    throw new UserLocationError("USER_NOT_FOUND");
  }
  return { actor, user };
}

async function recalculateAutomaticOwner(
  tx: TransactionClient,
  input: {
    user: LocationUser;
    actorId: string;
    reason: string;
    now: Date;
  }
): Promise<{
  ownerId: string | null;
  ownerRecalculated: boolean;
  transferredTasks: number;
  matchedRuleId: string | null;
}> {
  if (input.user.ownerAssignmentMode === "MANUAL") {
    return {
      ownerId: input.user.ownerId,
      ownerRecalculated: false,
      transferredTasks: 0,
      matchedRuleId: null
    };
  }

  const decision = await assignUserOwnerInTransaction(
    tx,
    input.user.id,
    input.now,
    { forceAutomatic: true }
  );
  const ownerChanged =
    Boolean(decision.assigneeId) &&
    decision.assigneeId !== input.user.ownerId;
  const transferredTasks = ownerChanged
    ? await transferOpenUserTasks(tx, {
        userId: input.user.id,
        actorId: input.actorId,
        ownerId: decision.assigneeId!,
        reason: input.reason,
        now: input.now,
        source: "user_location_change"
      })
    : 0;
  return {
    ownerId: decision.assigneeId,
    ownerRecalculated: true,
    transferredTasks,
    matchedRuleId: decision.matchedRuleId
  };
}

export async function manuallyAssignUserLocation(
  input: LocationChangeInput & {
    countryCode: string;
    region?: string | null;
    reason: string;
  }
): Promise<LocationChangeResult> {
  const now = input.now ?? new Date();
  const countryCode = input.countryCode.trim().toUpperCase();
  const region = input.region?.trim() || null;
  const reason = input.reason.trim();
  if (!countryCode) {
    throw new UserLocationError("COUNTRY_REQUIRED");
  }
  if (!/^[A-Z]{2}$/u.test(countryCode)) {
    throw new UserLocationError("COUNTRY_INVALID");
  }
  if (!reason) {
    throw new UserLocationError("REASON_REQUIRED");
  }

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const { actor, user } = await loadActorAndUser(tx, input);
    await tx.userProfile.update({
      where: { id: user.id },
      data: {
        countryCode,
        region,
        locationSource: null,
        locationRuleId: null,
        locationEvaluatedAt: now,
        locationAssignmentMode: "MANUAL",
        locationAssignedAt: now,
        locationAssignedById: actor.id,
        locationAssignmentReason: reason
      }
    });
    const owner = await recalculateAutomaticOwner(tx, {
      user,
      actorId: actor.id,
      reason,
      now
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "user.location_manually_assigned",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: {
          previousCountryCode: user.countryCode,
          previousRegion: user.region,
          countryCode,
          region,
          locationAssignmentMode: "MANUAL",
          reason,
          previousOwnerId: user.ownerId,
          ownerId: owner.ownerId,
          ownerRecalculated: owner.ownerRecalculated,
          matchedRuleId: owner.matchedRuleId,
          transferredTasks: owner.transferredTasks
        }
      }
    });
    return {
      userId: user.id,
      previousCountryCode: user.countryCode,
      previousRegion: user.region,
      countryCode,
      region,
      mode: "MANUAL",
      previousOwnerId: user.ownerId,
      ownerId: owner.ownerId,
      ownerRecalculated: owner.ownerRecalculated,
      transferredTasks: owner.transferredTasks
    };
  });
}

export async function restoreAutomaticUserLocation(
  input: LocationChangeInput
): Promise<LocationChangeResult> {
  const now = input.now ?? new Date();
  const [rules, resolver] = [
    await loadActiveLocationRules(),
    createGeoIpResolver()
  ];

  return prisma.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const { actor, user } = await loadActorAndUser(tx, input);
    if (user.locationAssignmentMode !== "MANUAL") {
      throw new UserLocationError("LOCATION_ALREADY_AUTOMATIC");
    }
    const location = await recalculateStoredUserLocation(
      {
        email: user.email,
        registrationIp: user.ipCountryCode
          ? null
          : decryptRegistrationIp(user.registrationIpEnc),
        ipCountryCode: user.ipCountryCode,
        ipRegion: user.ipRegion
      },
      rules,
      resolver
    );
    await tx.userProfile.update({
      where: { id: user.id },
      data: {
        countryCode: location.countryCode,
        region: location.region,
        ipCountryCode: location.ipCountryCode,
        ipRegion: location.ipRegion,
        locationSource: location.source,
        locationRuleId: location.ruleId,
        locationEvaluatedAt: now,
        locationAssignmentMode: "AUTO",
        locationAssignedAt: now,
        locationAssignedById: null,
        locationAssignmentReason: null
      }
    });
    const reason = "管理员恢复系统自动判定地区";
    const owner = await recalculateAutomaticOwner(tx, {
      user,
      actorId: actor.id,
      reason,
      now
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "user.location_auto_restored",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: {
          previousCountryCode: user.countryCode,
          previousRegion: user.region,
          countryCode: location.countryCode,
          region: location.region,
          locationAssignmentMode: "AUTO",
          previousOwnerId: user.ownerId,
          ownerId: owner.ownerId,
          ownerRecalculated: owner.ownerRecalculated,
          matchedRuleId: owner.matchedRuleId,
          transferredTasks: owner.transferredTasks
        }
      }
    });
    return {
      userId: user.id,
      previousCountryCode: user.countryCode,
      previousRegion: user.region,
      countryCode: location.countryCode,
      region: location.region,
      mode: "AUTO",
      previousOwnerId: user.ownerId,
      ownerId: owner.ownerId,
      ownerRecalculated: owner.ownerRecalculated,
      transferredTasks: owner.transferredTasks
    };
  });
}
