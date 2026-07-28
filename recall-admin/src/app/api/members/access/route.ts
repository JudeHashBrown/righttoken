import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  grantMemberAccess,
  MemberAccessError
} from "@/modules/auth/member-access";

const inputSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: z.enum(["ADMIN", "OPERATOR"])
  })
  .strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const parsed = inputSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { code: "INVALID_MEMBER_ACCESS_REQUEST" },
        { status: 400 }
      );
    }
    const permission =
      parsed.data.role === "ADMIN"
        ? ("admins:manage" as const)
        : ("operators:manage" as const);
    const { member: actor } = await requireRequestPermission(
      request,
      permission
    );
    const member = await grantMemberAccess(
      actor.id,
      parsed.data.email,
      parsed.data.role
    );
    return NextResponse.json({ member }, { status: 201 });
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
    if (error instanceof MemberAccessError) {
      const status =
        error.code === "RIGHTTOKEN_USER_NOT_FOUND"
          ? 404
          : error.code === "MEMBER_ALREADY_ACTIVE"
            ? 409
            : 403;
      return NextResponse.json({ code: error.code }, { status });
    }
    return NextResponse.json(
      { code: "MEMBER_ACCESS_GRANT_FAILED" },
      { status: 400 }
    );
  }
}
