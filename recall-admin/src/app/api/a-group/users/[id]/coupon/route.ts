import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import { getCouponIssuer } from "@/modules/b-group/coupon-issuer";
import { grantBGroupCoupon } from "@/modules/b-group/coupon-service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "tasks:work"
    );
    const { id } = await context.params;
    const result = await grantBGroupCoupon(
      member.id,
      id,
      getCouponIssuer()
    );
    if (result.status === "UNAVAILABLE") {
      return NextResponse.json(
        { code: "COUPON_SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }
    if (result.status === "FAILED") {
      return NextResponse.json(
        { code: "COUPON_GRANT_FAILED" },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { grant: result.grant },
      { status: result.alreadyGranted ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { code: "COUPON_GRANT_FAILED" },
      { status: 502 }
    );
  }
}
