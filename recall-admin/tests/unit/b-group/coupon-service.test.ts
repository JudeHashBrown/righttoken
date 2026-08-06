import { describe, expect, it, vi } from "vitest";
import {
  grantCouponWithStore,
  type CouponGrantRecord,
  type CouponGrantStore
} from "@/modules/b-group/coupon-service";

function memoryStore(): CouponGrantStore & {
  current: CouponGrantRecord | null;
} {
  return {
    current: null,
    async find() {
      return this.current;
    },
    async begin(input) {
      this.current = {
        id: "grant-1",
        status: "PENDING",
        grantedAt: null,
        failureCode: null,
        externalCouponId: null,
        ...input
      };
      return this.current;
    },
    async succeed(id, externalCouponId, grantedAt) {
      this.current = {
        ...this.current!,
        id,
        status: "SUCCEEDED",
        externalCouponId,
        grantedAt,
        failureCode: null
      };
      return this.current;
    },
    async fail(id, failureCode) {
      this.current = {
        ...this.current!,
        id,
        status: "FAILED",
        failureCode
      };
      return this.current;
    }
  };
}

describe("B-group coupon grants", () => {
  it("does not create a grant when the real issuer is unavailable", async () => {
    const store = memoryStore();
    await expect(
      grantCouponWithStore(
        {
          userId: "user-1",
          externalUserId: "rt-1",
          requestedById: "member-1"
        },
        store,
        null
      )
    ).resolves.toEqual({ status: "UNAVAILABLE" });
    expect(store.current).toBeNull();
  });

  it("issues USD 1.43 once and returns the existing success", async () => {
    const store = memoryStore();
    const issuer = {
      issue: vi.fn().mockResolvedValue({ couponId: "coupon-1" })
    };
    const input = {
      userId: "user-1",
      externalUserId: "rt-1",
      requestedById: "member-1"
    };

    const first = await grantCouponWithStore(input, store, issuer);
    const second = await grantCouponWithStore(input, store, issuer);

    expect(first).toMatchObject({
      status: "SUCCEEDED",
      alreadyGranted: false
    });
    expect(second).toMatchObject({
      status: "SUCCEEDED",
      alreadyGranted: true
    });
    expect(issuer.issue).toHaveBeenCalledTimes(1);
    expect(issuer.issue).toHaveBeenCalledWith({
      externalUserId: "rt-1",
      amountMinor: 143,
      currency: "USD",
      idempotencyKey: "b-group-143:user-1"
    });
  });

  it("records a stable failure code without claiming success", async () => {
    const store = memoryStore();
    const issuer = {
      issue: vi.fn().mockRejectedValue(new Error("network details"))
    };
    const result = await grantCouponWithStore(
      {
        userId: "user-1",
        externalUserId: "rt-1",
        requestedById: "member-1"
      },
      store,
      issuer
    );
    expect(result).toMatchObject({
      status: "FAILED",
      failureCode: "COUPON_ISSUER_FAILED"
    });
  });
});
