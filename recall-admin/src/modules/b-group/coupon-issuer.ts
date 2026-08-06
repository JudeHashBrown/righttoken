export type CouponIssueInput = {
  externalUserId: string;
  amountMinor: 143;
  currency: "USD";
  idempotencyKey: string;
};

export interface CouponIssuer {
  issue(input: CouponIssueInput): Promise<{ couponId: string }>;
}

type CouponIssuerEnv = {
  RIGHTTOKEN_COUPON_ENDPOINT?: string;
  RIGHTTOKEN_COUPON_TOKEN?: string;
};

export function getCouponIssuer(
  env: CouponIssuerEnv = {
    RIGHTTOKEN_COUPON_ENDPOINT:
      process.env.RIGHTTOKEN_COUPON_ENDPOINT,
    RIGHTTOKEN_COUPON_TOKEN:
      process.env.RIGHTTOKEN_COUPON_TOKEN
  }
): CouponIssuer | null {
  const endpoint = env.RIGHTTOKEN_COUPON_ENDPOINT?.trim();
  const token = env.RIGHTTOKEN_COUPON_TOKEN?.trim();
  if (!endpoint || !token) return null;
  return {
    async issue(input) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) throw new Error("COUPON_ISSUER_FAILED");
      const payload = (await response.json()) as {
        couponId?: unknown;
      };
      if (
        typeof payload.couponId !== "string" ||
        !payload.couponId.trim()
      ) {
        throw new Error("COUPON_ISSUER_INVALID_RESPONSE");
      }
      return { couponId: payload.couponId.trim() };
    }
  };
}
