import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import { requireRequestPermission } from "@/modules/auth/guards";
import { verifyPassword } from "@/modules/auth/password";
import { markReauthenticated } from "@/modules/auth/session";
import { verifySecondFactor } from "@/modules/auth/two-factor";

const reauthenticationSchema = z.object({
  password: z.string().min(12),
  code: z.string().min(6).max(32).optional()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const context = await requireRequestPermission(
      request,
      "users:read"
    );
    const parsed = reauthenticationSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_REAUTHENTICATION_REQUEST" },
        { status: 400 }
      );
    }

    const passwordValid = await verifyPassword(
      context.member.passwordHash,
      parsed.data.password
    );
    const secondFactorValid = context.member.twoFactorOn
      ? Boolean(
          parsed.data.code &&
            (await verifySecondFactor(
              context.member.id,
              parsed.data.code
            ))
        )
      : true;
    if (!passwordValid || !secondFactorValid) {
      return NextResponse.json(
        { code: "INVALID_REAUTHENTICATION" },
        { status: 401 }
      );
    }

    await markReauthenticated(context.session.id);
    return NextResponse.json({ reauthenticated: true });
  } catch {
    return NextResponse.json(
      { code: "INVALID_REAUTHENTICATION" },
      { status: 401 }
    );
  }
}
