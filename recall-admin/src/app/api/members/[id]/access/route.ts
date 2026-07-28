import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/modules/auth/csrf";
import {
  ForbiddenError,
  requireRequestPermission,
  UnauthorizedError
} from "@/modules/auth/guards";
import {
  MemberAccessError,
  revokeMemberAccess
} from "@/modules/auth/member-access";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const { member: actor } = await requireRequestPermission(
      request,
      "operators:manage"
    );
    const { id } = await context.params;
    const result = await revokeMemberAccess(actor.id, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    if (
      error instanceof ForbiddenError ||
      (error instanceof MemberAccessError &&
        error.code !== "TARGET_NOT_FOUND")
    ) {
      return NextResponse.json(
        {
          code:
            error instanceof MemberAccessError
              ? error.code
              : "FORBIDDEN"
        },
        { status: 403 }
      );
    }
    if (
      error instanceof MemberAccessError &&
      error.code === "TARGET_NOT_FOUND"
    ) {
      return NextResponse.json(
        { code: error.code },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { code: "MEMBER_ACCESS_REVOKE_FAILED" },
      { status: 400 }
    );
  }
}
