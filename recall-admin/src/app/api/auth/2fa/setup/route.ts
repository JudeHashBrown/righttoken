import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import { requireRequestPermission } from "@/modules/auth/guards";
import { beginTwoFactorSetup } from "@/modules/auth/two-factor";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member } = await requireRequestPermission(
      request,
      "users:read",
      { allowPendingSecondFactor: true }
    );
    if (member.twoFactorOn) {
      return NextResponse.json(
        { code: "TWO_FACTOR_ALREADY_ENABLED" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      await beginTwoFactorSetup(member.id)
    );
  } catch {
    return NextResponse.json(
      { code: "TWO_FACTOR_SETUP_FORBIDDEN" },
      { status: 403 }
    );
  }
}
