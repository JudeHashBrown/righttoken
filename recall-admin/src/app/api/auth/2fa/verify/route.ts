import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import { requireRequestPermission } from "@/modules/auth/guards";
import {
  AUTH_STATE_COOKIE_NAME,
  markSecondFactorVerified,
  sessionCookieOptions
} from "@/modules/auth/session";
import {
  confirmTwoFactorSetup,
  verifySecondFactor
} from "@/modules/auth/two-factor";

const verifySchema = z.object({
  code: z.string().min(6).max(32),
  pendingSecretToken: z.string().min(20).optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const context = await requireRequestPermission(
      request,
      "users:read",
      { allowPendingSecondFactor: true }
    );
    const parsed = verifySchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_SECOND_FACTOR_REQUEST" },
        { status: 400 }
      );
    }

    let recoveryCodes: string[] | undefined;
    if (context.member.twoFactorOn) {
      const valid = await verifySecondFactor(
        context.member.id,
        parsed.data.code
      );
      if (!valid) {
        return NextResponse.json(
          { code: "INVALID_SECOND_FACTOR" },
          { status: 401 }
        );
      }
    } else {
      if (!parsed.data.pendingSecretToken) {
        return NextResponse.json(
          { code: "TWO_FACTOR_SETUP_REQUIRED" },
          { status: 409 }
        );
      }
      const confirmed = await confirmTwoFactorSetup(
        context.member.id,
        parsed.data.pendingSecretToken,
        parsed.data.code
      );
      recoveryCodes = confirmed.recoveryCodes;
    }

    await markSecondFactorVerified(context.session.id);
    const response = NextResponse.json({
      verified: true,
      ...(recoveryCodes ? { recoveryCodes } : {})
    });
    response.cookies.set(AUTH_STATE_COOKIE_NAME, "", {
      ...sessionCookieOptions(new Date(0)),
      maxAge: 0
    });
    return response;
  } catch {
    return NextResponse.json(
      { code: "INVALID_SECOND_FACTOR" },
      { status: 401 }
    );
  }
}
