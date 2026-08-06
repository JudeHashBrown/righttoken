import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserActionAccess } from "@/modules/b-group/action-access";
import type { CouponIssuer } from "@/modules/b-group/coupon-issuer";

export type CouponGrantRecord = {
  id: string;
  userId: string;
  requestedById: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  externalCouponId: string | null;
  failureCode: string | null;
  grantedAt: Date | null;
};

export interface CouponGrantStore {
  find(userId: string): Promise<CouponGrantRecord | null>;
  begin(input: {
    userId: string;
    requestedById: string;
    amountMinor: 143;
    currency: "USD";
    idempotencyKey: string;
  }): Promise<CouponGrantRecord>;
  succeed(
    id: string,
    externalCouponId: string,
    grantedAt: Date
  ): Promise<CouponGrantRecord>;
  fail(id: string, failureCode: string): Promise<CouponGrantRecord>;
}

type GrantInput = {
  userId: string;
  externalUserId: string;
  requestedById: string;
};

export async function grantCouponWithStore(
  input: GrantInput,
  store: CouponGrantStore,
  issuer: CouponIssuer | null,
  now = new Date()
) {
  if (!issuer) return { status: "UNAVAILABLE" as const };
  const existing = await store.find(input.userId);
  if (existing?.status === "SUCCEEDED") {
    return {
      status: "SUCCEEDED" as const,
      alreadyGranted: true,
      grant: existing
    };
  }
  if (existing?.status === "PENDING") {
    return {
      status: "PENDING" as const,
      alreadyGranted: false,
      grant: existing
    };
  }
  const idempotencyKey = `b-group-143:${input.userId}`;
  const grant = await store.begin({
    userId: input.userId,
    requestedById: input.requestedById,
    amountMinor: 143,
    currency: "USD",
    idempotencyKey
  });
  try {
    const result = await issuer.issue({
      externalUserId: input.externalUserId,
      amountMinor: 143,
      currency: "USD",
      idempotencyKey
    });
    return {
      status: "SUCCEEDED" as const,
      alreadyGranted: false,
      grant: await store.succeed(grant.id, result.couponId, now)
    };
  } catch {
    return {
      status: "FAILED" as const,
      alreadyGranted: false,
      failureCode: "COUPON_ISSUER_FAILED" as const,
      grant: await store.fail(
        grant.id,
        "COUPON_ISSUER_FAILED"
      )
    };
  }
}

const prismaCouponStore: CouponGrantStore = {
  find(userId) {
    return prisma.couponGrant.findUnique({ where: { userId } });
  },
  begin(input) {
    return prisma.couponGrant.upsert({
      where: { userId: input.userId },
      create: { ...input, status: "PENDING" },
      update: {
        requestedById: input.requestedById,
        status: "PENDING",
        failureCode: null
      }
    });
  },
  succeed(id, externalCouponId, grantedAt) {
    return prisma.couponGrant.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        externalCouponId,
        grantedAt,
        failureCode: null
      }
    });
  },
  fail(id, failureCode) {
    return prisma.couponGrant.update({
      where: { id },
      data: { status: "FAILED", failureCode }
    });
  }
};

export async function grantBGroupCoupon(
  actorId: string,
  userId: string,
  issuer: CouponIssuer | null
) {
  const accessible = await prisma.$transaction((tx) =>
    requireUserActionAccess(tx, actorId, userId)
  );
  const result = await grantCouponWithStore(
    {
      userId: accessible.user.id,
      externalUserId: accessible.user.externalUserId,
      requestedById: accessible.actor.id
    },
    prismaCouponStore,
    issuer
  );
  if (result.status !== "UNAVAILABLE") {
    await prisma.auditLog.create({
      data: {
        actorId: accessible.actor.id,
        action: "coupon_grant.requested",
        entityType: "UserProfile",
        entityId: accessible.user.id,
        metadata: {
          amountMinor: 143,
          currency: "USD",
          status: result.status,
          alreadyGranted: result.alreadyGranted
        } satisfies Prisma.InputJsonValue
      }
    });
  }
  return result;
}
